#!/usr/bin/env python3
import asyncio
import struct
import time

from bleak import BleakClient

import virtual_hill_tracker as base
import virtual_hill_local as tracker
import virtual_hill_absolute_pan as abs_pan

TRACK_SECONDS = 20.0
LOCK_RANGE_KM = 8.0
PAN_TOLERANCE_DEG = 1.5
HOME_TIMEOUT_SECONDS = 20.0
RECENT_SECONDS = 90.0
WAIT_SECONDS = 0.8


async def main():
    print("CONTINUOUS RIBBON CURRENT -> TOWER HOME TEST", flush=True)
    print("Tilt is DISABLED. Ctrl+C stops the test.", flush=True)

    tower_bearing = base.bearing_deg(
        base.HILL_LAT,
        base.HILL_LON,
        abs_pan.TOWER_LAT,
        abs_pan.TOWER_LON,
    )

    client = None
    tx_char = None
    sequence = 0x8D00
    latest_yaw = None
    home_yaw = None
    recent = {}

    def receive(sender, data):
        nonlocal latest_yaw
        b = bytes(data)
        if len(b) < 19 or b[0] != 0x55:
            return
        if b[9] != 0x04 or b[10] != 0x05:
            return
        payload = b[11:-2]
        if len(payload) < 6:
            return
        try:
            _, _, yaw_raw = struct.unpack_from("<hhh", payload, 0)
        except struct.error:
            return
        latest_yaw = yaw_raw / 10.0

    async def disconnect_ble():
        nonlocal client, tx_char
        tx_char = None
        if client is not None:
            try:
                if client.is_connected:
                    await asyncio.wait_for(client.disconnect(), 4)
            except Exception:
                pass
        client = None

    async def connect_ble(label="RS 4 Bluetooth connected."):
        nonlocal client, tx_char, latest_yaw
        await disconnect_ble()
        latest_yaw = None
        last_error = None

        for attempt in range(1, 6):
            try:
                client = BleakClient(base.DEVICE, timeout=20)
                await asyncio.wait_for(client.connect(), 25)
                await asyncio.sleep(0.8)
                await asyncio.wait_for(client.start_notify(base.RX, receive), 6)
                tx_char = client.services.get_characteristic(base.TX)
                if tx_char is None:
                    raise RuntimeError("RS 4 TX characteristic not found")

                size = 0
                for _ in range(20):
                    try:
                        size = int(tx_char.max_write_without_response_size)
                    except Exception:
                        size = 0
                    if size >= 22:
                        break
                    await asyncio.sleep(0.4)
                if size < 22:
                    raise RuntimeError("RS 4 Bluetooth message size is too small")

                deadline = time.monotonic() + 4.0
                while latest_yaw is None and time.monotonic() < deadline:
                    await asyncio.sleep(0.05)
                if latest_yaw is None:
                    raise RuntimeError("No RS 4 yaw telemetry after connect")

                print(f"{label} (attempt {attempt})", flush=True)
                return
            except Exception as error:
                last_error = error
                await disconnect_ble()
                if attempt < 5:
                    print(f"Bluetooth retry {attempt}/5...", flush=True)
                    await asyncio.sleep(2.0)

        raise RuntimeError(f"Could not connect RS 4: {last_error}")

    async def ensure_ble(reason="RS 4 link dropped - reconnecting..."):
        if client is not None and client.is_connected and tx_char is not None:
            return
        print(reason, flush=True)
        await connect_ble("RS 4 reconnected")

    async def send_pan(pan):
        nonlocal sequence
        if client is None or tx_char is None or not client.is_connected:
            raise EOFError("RS 4 Bluetooth unavailable")
        seq = sequence
        sequence += 1
        await client.write_gatt_char(tx_char, base.packet(seq, 0, pan), response=False)

    async def stop_motion():
        if client is None or tx_char is None or not client.is_connected:
            return
        for _ in range(5):
            try:
                await send_pan(0)
            except Exception:
                return
            await asyncio.sleep(0.05)

    async def drive_once(desired_yaw, label):
        await ensure_ble()
        if latest_yaw is None:
            return False

        error = abs_pan.angle_error(desired_yaw, latest_yaw)
        cmd = abs_pan.pan_command(error)
        print(
            f"{label} desired {desired_yaw:+.1f}  actual {latest_yaw:+.1f}  "
            f"error {error:+.1f}  pan {cmd:+d}",
            flush=True,
        )

        if cmd == 0:
            await stop_motion()
            return True

        end = time.monotonic() + 0.20
        while time.monotonic() < end:
            if latest_yaw is not None:
                error = abs_pan.angle_error(desired_yaw, latest_yaw)
                cmd = abs_pan.pan_command(error)
                if cmd == 0:
                    break
            try:
                await send_pan(cmd)
            except Exception:
                await ensure_ble("RS 4 link dropped during movement - reconnecting...")
                return False
            await asyncio.sleep(0.05)

        await stop_motion()
        return latest_yaw is not None and abs(abs_pan.angle_error(desired_yaw, latest_yaw)) <= PAN_TOLERANCE_DEG

    async def return_home():
        print("AIRCRAFT TRACK COMPLETE. RETURNING TO TOWER NOW...", flush=True)
        await ensure_ble("Checking RS 4 link before HOME return...")

        home_start = time.monotonic()
        while time.monotonic() - home_start < HOME_TIMEOUT_SECONDS:
            reached = await drive_once(home_yaw, "HOME")
            if reached:
                print(f"TOWER HOME REACHED yaw {latest_yaw:+.1f} deg", flush=True)
                return True
            await asyncio.sleep(0.08)

        await stop_motion()
        print("HOME RETURN TIMEOUT - stopped safely.", flush=True)
        return False

    async def wait_for_selection():
        while True:
            await ensure_ble()

            now = time.monotonic()
            for hx in list(recent):
                if recent[hx] <= now:
                    recent.pop(hx, None)

            try:
                engine = await asyncio.to_thread(base.fetch_engine)
                candidate = abs_pan.current_selection(engine)
            except Exception:
                candidate = None

            if candidate and candidate.get("hex") in recent:
                print(f"At TOWER HOME - ribbon CURRENT {candidate['callsign']} already completed; waiting for a new CURRENT...", flush=True)
                candidate = None

            if candidate:
                try:
                    target = await asyncio.to_thread(tracker.local_target, candidate)
                except Exception:
                    target = None

                if target and target["distance"] <= LOCK_RANGE_KM:
                    return candidate

                if target:
                    print(
                        f"CURRENT {target['callsign']} {target['distance']:.1f} km - waiting for 8.0 km",
                        flush=True,
                    )
                else:
                    print("At TOWER HOME - waiting for CURRENT in local ADS-B...", flush=True)
            else:
                print("At TOWER HOME - waiting for a new ribbon CURRENT...", flush=True)

            await stop_motion()
            await asyncio.sleep(WAIT_SECONDS)

    async def track_one(selection):
        print(f"LOCKED {selection['callsign']} - tracking for {TRACK_SECONDS:.0f} seconds", flush=True)
        track_start = time.monotonic()

        while time.monotonic() - track_start < TRACK_SECONDS:
            await ensure_ble()

            try:
                target = await asyncio.to_thread(tracker.local_target, selection)
            except Exception:
                target = None

            if target is None:
                await stop_motion()
                print("Target temporarily missing from local ADS-B...", flush=True)
                await asyncio.sleep(0.35)
                continue

            relative = abs_pan.wrap180(target["bearing"] - tower_bearing)
            if abs(relative) > abs_pan.MAX_RELATIVE_PAN_DEG:
                print("Target left safe pan sector. Ending aircraft track.", flush=True)
                break

            desired_yaw = abs_pan.wrap180(home_yaw + relative)
            reached = await drive_once(desired_yaw, selection["callsign"])
            print(
                f"LOCAL {target['callsign']} {target['distance']:.2f} km  "
                f"relative-to-tower {relative:+.1f} deg  {'ON_TARGET' if reached else 'CORRECTING'}",
                flush=True,
            )
            await asyncio.sleep(0.10)

        await stop_motion()

    try:
        await connect_ble()
        await stop_motion()

        home_yaw = latest_yaw
        print(f"TOWER HOME CAPTURED yaw {home_yaw:+.1f} deg", flush=True)
        print("Continuous cycle started. Waiting for ribbon CURRENT inside 8 km...", flush=True)

        while True:
            selection = await wait_for_selection()
            await track_one(selection)

            hx = selection.get("hex")
            if hx:
                recent[hx] = time.monotonic() + RECENT_SECONDS

            home_ok = await return_home()
            if not home_ok:
                print("Stopping continuous test because HOME was not reached safely.", flush=True)
                break

            print("At TOWER HOME. Looking for the next ribbon CURRENT...", flush=True)
            await asyncio.sleep(WAIT_SECONDS)

    except KeyboardInterrupt:
        print("Stopped by user.", flush=True)
    except Exception as error:
        print("CONTINUOUS HOME TEST:", type(error).__name__, str(error), flush=True)
    finally:
        try:
            await stop_motion()
        except Exception:
            pass
        await disconnect_ble()
        print("Finished.", flush=True)


if __name__ == "__main__":
    asyncio.run(main())
