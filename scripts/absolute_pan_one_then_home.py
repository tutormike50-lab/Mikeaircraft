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
HOME_TIMEOUT_SECONDS = 18.0


async def main():
    print("ONE AIRCRAFT -> TOWER HOME TEST", flush=True)
    print("Tilt is DISABLED. This program stops after returning HOME.", flush=True)

    tower_bearing = base.bearing_deg(
        base.HILL_LAT,
        base.HILL_LON,
        abs_pan.TOWER_LAT,
        abs_pan.TOWER_LON,
    )

    client = BleakClient(base.DEVICE, timeout=20)
    tx_char = None
    sequence = 0x8500
    latest_yaw = None
    home_yaw = None

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

    async def send_pan(pan):
        nonlocal sequence
        if tx_char is None or not client.is_connected:
            raise EOFError("RS 4 Bluetooth unavailable")
        seq = sequence
        sequence += 1
        await client.write_gatt_char(tx_char, base.packet(seq, 0, pan), response=False)

    async def stop_motion():
        if tx_char is None or not client.is_connected:
            return
        for _ in range(5):
            try:
                await send_pan(0)
            except Exception:
                return
            await asyncio.sleep(0.05)

    async def drive_once(desired_yaw, label):
        if latest_yaw is None:
            await stop_motion()
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
            await send_pan(cmd)
            await asyncio.sleep(0.05)
        await stop_motion()
        return latest_yaw is not None and abs(abs_pan.angle_error(desired_yaw, latest_yaw)) <= PAN_TOLERANCE_DEG

    try:
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

        await stop_motion()

        deadline = time.monotonic() + 4.0
        while latest_yaw is None and time.monotonic() < deadline:
            await asyncio.sleep(0.05)
        if latest_yaw is None:
            raise RuntimeError("No RS 4 yaw telemetry")

        home_yaw = latest_yaw
        print(f"TOWER HOME CAPTURED yaw {home_yaw:+.1f} deg", flush=True)
        print("Waiting for ribbon CURRENT inside 8 km...", flush=True)

        selection = None
        while selection is None:
            try:
                engine = await asyncio.to_thread(base.fetch_engine)
                candidate = abs_pan.current_selection(engine)
            except Exception:
                candidate = None

            if candidate:
                try:
                    target = await asyncio.to_thread(tracker.local_target, candidate)
                except Exception:
                    target = None
                if target and target["distance"] <= LOCK_RANGE_KM:
                    selection = candidate
                    break
                if target:
                    print(
                        f"CURRENT {target['callsign']} {target['distance']:.1f} km - waiting for 8.0 km",
                        flush=True,
                    )
            await stop_motion()
            await asyncio.sleep(0.8)

        print(f"LOCKED {selection['callsign']} - tracking for {TRACK_SECONDS:.0f} seconds", flush=True)
        track_start = time.monotonic()

        while time.monotonic() - track_start < TRACK_SECONDS:
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
        print("AIRCRAFT TRACK COMPLETE. RETURNING TO TOWER NOW...", flush=True)

        home_start = time.monotonic()
        while time.monotonic() - home_start < HOME_TIMEOUT_SECONDS:
            reached = await drive_once(home_yaw, "HOME")
            if reached:
                print(f"TOWER HOME REACHED yaw {latest_yaw:+.1f} deg", flush=True)
                print("TEST COMPLETE - stopping here. No second aircraft will be selected.", flush=True)
                return
            await asyncio.sleep(0.08)

        await stop_motion()
        print("HOME RETURN TIMEOUT - stopped safely.", flush=True)

    except KeyboardInterrupt:
        print("Stopped by user.", flush=True)
    except Exception as error:
        print("ONE-THEN-HOME TEST:", type(error).__name__, str(error), flush=True)
    finally:
        try:
            await stop_motion()
        except Exception:
            pass
        if client.is_connected:
            try:
                await asyncio.wait_for(client.disconnect(), 4)
            except Exception:
                pass
        print("Finished.", flush=True)


if __name__ == "__main__":
    asyncio.run(main())
