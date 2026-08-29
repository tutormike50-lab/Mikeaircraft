#!/usr/bin/env python3
import asyncio
import struct
import time

from bleak import BleakClient

import virtual_hill_tracker as base
import virtual_hill_local as tracker

# Virtual Hostivice spotting hill reference.
HILL_LAT = base.HILL_LAT
HILL_LON = base.HILL_LON

# Prague control tower reference used only for this virtual test.
# Approximate tower position derived from known airport mapping/photo geometry.
TOWER_LAT = 50.10536
TOWER_LON = 14.26623

LOCK_RANGE_KM = 8.0
MAX_RELATIVE_PAN_DEG = 170.0
PAN_TOLERANCE_DEG = 1.5
WAIT_SECONDS = 1.2
RECENT_SECONDS = 90.0


def wrap180(value):
    return (value + 180.0) % 360.0 - 180.0


def angle_error(target, current):
    return wrap180(target - current)


def pan_command(error):
    magnitude = abs(error)
    if magnitude <= PAN_TOLERANCE_DEG:
        return 0
    if magnitude > 35:
        speed = 360
    elif magnitude > 18:
        speed = 300
    elif magnitude > 8:
        speed = 220
    elif magnitude > 3:
        speed = 140
    else:
        speed = 80
    return speed if error > 0 else -speed


def current_selection(engine):
    aircraft = engine.get("aircraft") or []
    current = (engine.get("intelligence") or {}).get("current") or {}
    current_id = current.get("id")
    current_hex = tracker.clean_hex(current.get("hex"))

    if not current_id and not current_hex:
        return None

    for ac in aircraft:
        if not tracker.same_aircraft(ac, current_id, current_hex):
            continue
        hx = tracker.clean_hex(ac.get("hex"))
        if not hx:
            return None
        state = tracker.gimbal_state(ac, current) or str(current.get("state") or ac.get("state") or "CURRENT").upper()
        target = base.make_target(ac, current, "RIBBON_CURRENT")
        if not target:
            return None
        return {
            "id": ac.get("id") or target.get("id"),
            "hex": hx,
            "callsign": target.get("callsign") or hx,
            "state": state,
            "distance": target.get("distance"),
        }
    return None


async def main():
    print("VIRTUAL HILL - ABSOLUTE PAN / RIBBON CURRENT", flush=True)
    print("Tower is HOME. Tilt control is DISABLED for this test.", flush=True)

    tower_bearing = base.bearing_deg(HILL_LAT, HILL_LON, TOWER_LAT, TOWER_LON)
    print(f"Virtual hill -> tower bearing {tower_bearing:.1f} deg", flush=True)

    client = None
    tx_char = None
    sequence = 0x8100
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

    async def connect_ble():
        nonlocal client, tx_char
        await disconnect_ble()
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

                print(f"RS 4 Bluetooth connected (attempt {attempt}).", flush=True)
                return
            except Exception as error:
                last_error = error
                await disconnect_ble()
                if attempt < 5:
                    await asyncio.sleep(2.0)
        raise RuntimeError(f"Could not connect RS 4: {last_error}")

    async def send_pan(pan):
        nonlocal sequence
        if client is None or not client.is_connected or tx_char is None:
            raise EOFError("RS 4 Bluetooth unavailable")
        seq = sequence
        sequence += 1
        # Tilt is always zero in this test.
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

    async def ensure_ble():
        if client is not None and client.is_connected and tx_char is not None:
            return
        print("RS 4 link dropped - reconnecting...", flush=True)
        await connect_ble()
        await stop_motion()

    async def capture_home():
        nonlocal home_yaw
        deadline = time.monotonic() + 4.0
        while latest_yaw is None and time.monotonic() < deadline:
            await asyncio.sleep(0.05)
        if latest_yaw is None:
            raise RuntimeError("No RS 4 yaw telemetry")
        home_yaw = latest_yaw
        print(f"TOWER HOME CAPTURED  yaw {home_yaw:+.1f} deg", flush=True)

    async def drive_to_yaw(desired_yaw, label="TARGET"):
        await ensure_ble()
        if latest_yaw is None:
            await stop_motion()
            return False

        error = angle_error(desired_yaw, latest_yaw)
        cmd = pan_command(error)
        print(
            f"{label} desired {desired_yaw:+.1f}  actual {latest_yaw:+.1f}  error {error:+.1f}  pan {cmd:+d}",
            flush=True,
        )

        if cmd == 0:
            await stop_motion()
            return True

        end = time.monotonic() + 0.22
        while time.monotonic() < end:
            try:
                if latest_yaw is not None:
                    error = angle_error(desired_yaw, latest_yaw)
                    cmd = pan_command(error)
                    if cmd == 0:
                        break
                await send_pan(cmd)
            except Exception:
                await stop_motion()
                return False
            await asyncio.sleep(0.05)
        await stop_motion()
        return abs(angle_error(desired_yaw, latest_yaw)) <= PAN_TOLERANCE_DEG if latest_yaw is not None else False

    async def return_home():
        if home_yaw is None:
            return
        print("Returning to TOWER HOME...", flush=True)
        start = time.monotonic()
        while time.monotonic() - start < 15.0:
            reached = await drive_to_yaw(home_yaw, "HOME")
            if reached:
                print(f"TOWER HOME REACHED  yaw {latest_yaw:+.1f} deg", flush=True)
                return
            await asyncio.sleep(0.08)
        await stop_motion()
        print("HOME RETURN TIMEOUT - stopped safely.", flush=True)

    async def current_is_same(selection):
        try:
            engine = await asyncio.to_thread(base.fetch_engine)
            now_sel = current_selection(engine)
        except Exception:
            return True
        if not now_sel:
            return False
        return now_sel.get("hex") == selection.get("hex")

    try:
        await connect_ble()
        await stop_motion()
        await capture_home()

        while True:
            # Keep expired aircraft from immediately being reused if the ribbon lingers.
            now = time.monotonic()
            for hx in list(recent):
                if recent[hx] <= now:
                    recent.pop(hx, None)

            try:
                engine = await asyncio.to_thread(base.fetch_engine)
                selection = current_selection(engine)
            except Exception:
                selection = None

            if selection and selection.get("hex") in recent:
                selection = None

            if selection is None:
                if home_yaw is not None and latest_yaw is not None and abs(angle_error(home_yaw, latest_yaw)) > PAN_TOLERANCE_DEG:
                    await return_home()
                else:
                    await stop_motion()
                print("At TOWER HOME - waiting for ribbon CURRENT...", flush=True)
                await asyncio.sleep(WAIT_SECONDS)
                continue

            print(
                f"RIBBON CURRENT {selection['callsign']}  {selection['state']}  {selection['distance']:.1f} km from virtual hill",
                flush=True,
            )

            # Wait at HOME until CURRENT enters the lock range.
            locked = False
            lock_started = None
            last_ribbon_check = 0.0

            while True:
                try:
                    target = await asyncio.to_thread(tracker.local_target, selection)
                except Exception:
                    target = None

                now = time.monotonic()
                if now - last_ribbon_check >= 1.5:
                    last_ribbon_check = now
                    if not await current_is_same(selection):
                        print("Ribbon CURRENT changed/cleared. Ending this target.", flush=True)
                        break

                if target is None:
                    await stop_motion()
                    await asyncio.sleep(0.35)
                    continue

                if not locked:
                    if target["distance"] > LOCK_RANGE_KM:
                        print(f"CURRENT {target['callsign']} {target['distance']:.1f} km - waiting for 8.0 km", flush=True)
                        await stop_motion()
                        await asyncio.sleep(0.5)
                        continue
                    locked = True
                    lock_started = now
                    print(f"LOCKED {target['callsign']} at {target['distance']:.1f} km", flush=True)

                relative = wrap180(target["bearing"] - tower_bearing)
                if abs(relative) > MAX_RELATIVE_PAN_DEG:
                    print(f"Target is {relative:+.1f} deg from tower - outside safe pan sector. Ending target.", flush=True)
                    break

                desired_yaw = wrap180(home_yaw + relative)
                reached = await drive_to_yaw(desired_yaw, target["callsign"])

                print(
                    f"LOCAL {target['callsign']} {target['distance']:.2f} km  aircraft bearing {target['bearing']:.1f}  "
                    f"relative-to-tower {relative:+.1f} deg  {'ON_TARGET' if reached else 'CORRECTING'}",
                    flush=True,
                )

                if lock_started is not None and now - lock_started >= base.MAX_TRACK_SECONDS:
                    print("45-second tracking window complete.", flush=True)
                    break

                await asyncio.sleep(0.10)

            await stop_motion()
            if selection.get("hex"):
                recent[selection["hex"]] = time.monotonic() + RECENT_SECONDS
            await return_home()
            print("At TOWER HOME. Waiting for next ribbon CURRENT...", flush=True)
            await asyncio.sleep(0.8)

    except KeyboardInterrupt:
        print("Stopped by user.", flush=True)
    except Exception as error:
        print("ABSOLUTE PAN TRACKER:", type(error).__name__, str(error), flush=True)
    finally:
        try:
            await stop_motion()
        except Exception:
            pass
        await disconnect_ble()
        print("Finished.", flush=True)


if __name__ == "__main__":
    asyncio.run(main())
