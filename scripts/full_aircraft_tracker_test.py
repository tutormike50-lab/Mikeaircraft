#!/usr/bin/env python3
import asyncio
import struct
import time

from bleak import BleakClient

import virtual_hill_tracker as base
import virtual_hill_local as tracker
import virtual_hill_absolute_pan as abs_pan


# Temporary indoor test position: central Makovskeho, Praha-Repy.
# The GPS module will replace this with the exact live camera position later.
WINDOW_LAT = 50.0657
WINDOW_LON = 14.3060

LOCK_RANGE_KM = 12.0
DROP_RANGE_KM = 14.0
MAX_TRACK_SECONDS = 300.0
PAN_TOLERANCE_DEG = 1.2
TILT_TOLERANCE_DEG = 0.8
MAX_RELATIVE_TILT_DEG = 18.0
TOWER_HOME_ELEVATION_DEG = 1.0
HOME_TIMEOUT_SECONDS = 30.0
RECENT_SECONDS = 120.0
WAIT_SECONDS = 0.8


def axis_command(error, tolerance, speeds):
    magnitude = abs(error)
    if magnitude <= tolerance:
        return 0
    for threshold, speed in speeds:
        if magnitude > threshold:
            return speed if error > 0 else -speed
    speed = speeds[-1][1]
    return speed if error > 0 else -speed


def pan_command(error):
    return axis_command(error, PAN_TOLERANCE_DEG, [
        (60, 100), (30, 85), (15, 65), (7, 48), (3, 34), (0, 20)
    ])


def tilt_command(error):
    return axis_command(error, TILT_TOLERANCE_DEG, [
        (10, 70), (5, 50), (2, 35), (0, 22)
    ])


async def main():
    print("FULL AIRCRAFT TRACKING TEST - PAN + TILT", flush=True)
    print("Ctrl+C stops immediately. Target remains committed through landing (5-minute safety maximum).", flush=True)

    # Override the old virtual-hill reference for every local ADS-B calculation.
    base.HILL_LAT = WINDOW_LAT
    base.HILL_LON = WINDOW_LON
    tower_bearing = base.bearing_deg(
        WINDOW_LAT, WINDOW_LON, abs_pan.TOWER_LAT, abs_pan.TOWER_LON
    )
    print(f"Camera location: Makovskeho Repy {WINDOW_LAT:.4f}, {WINDOW_LON:.4f}", flush=True)
    print(f"Bearing from window to tower: {tower_bearing:.1f} deg", flush=True)

    client = None
    tx_char = None
    sequence = 0xA100
    latest_pitch = None
    latest_yaw = None
    home_pitch = None
    home_yaw = None
    tilt_telemetry_sign = None
    recent = {}

    def receive(sender, data):
        nonlocal latest_pitch, latest_yaw
        b = bytes(data)
        if len(b) < 19 or b[0] != 0x55 or b[9] != 0x04 or b[10] != 0x05:
            return
        payload = b[11:-2]
        if len(payload) < 6:
            return
        try:
            _, pitch_raw, yaw_raw = struct.unpack_from("<hhh", payload, 0)
        except struct.error:
            return
        latest_pitch = pitch_raw / 10.0
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

    async def connect_ble(label="RS 4 Bluetooth connected"):
        nonlocal client, tx_char, latest_pitch, latest_yaw
        await disconnect_ble()
        latest_pitch = None
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
                while (latest_pitch is None or latest_yaw is None) and time.monotonic() < deadline:
                    await asyncio.sleep(0.05)
                if latest_pitch is None or latest_yaw is None:
                    raise RuntimeError("No RS 4 telemetry after connect")
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

    async def send_axes(tilt, pan):
        nonlocal sequence
        if client is None or tx_char is None or not client.is_connected:
            raise EOFError("RS 4 Bluetooth unavailable")
        seq = sequence
        sequence += 1
        await client.write_gatt_char(tx_char, base.packet(seq, tilt, pan), response=False)

    async def stop_motion():
        if client is None or tx_char is None or not client.is_connected:
            return
        for _ in range(5):
            try:
                await send_axes(0, 0)
            except Exception:
                return
            await asyncio.sleep(0.05)

    async def calibrate_tilt_direction():
        nonlocal tilt_telemetry_sign
        print("Small automatic tilt calibration...", flush=True)
        before = latest_pitch
        for _ in range(5):
            await send_axes(55, 0)
            await asyncio.sleep(0.05)
        await stop_motion()
        await asyncio.sleep(0.35)
        change = abs_pan.angle_error(latest_pitch, before)
        if abs(change) < 0.15:
            tilt_telemetry_sign = None
            print("Tilt calibration inconclusive - tilt disabled safely.", flush=True)
            return
        tilt_telemetry_sign = 1 if change > 0 else -1
        print(f"Tilt calibration confirmed ({change:+.1f} deg). Returning to tower position...", flush=True)

    async def drive_once(desired_yaw, desired_pitch, label):
        await ensure_ble()
        if latest_yaw is None or latest_pitch is None:
            return False
        yaw_error = abs_pan.angle_error(desired_yaw, latest_yaw)
        pitch_error = abs_pan.angle_error(desired_pitch, latest_pitch)
        pan = pan_command(yaw_error)
        tilt = 0 if tilt_telemetry_sign is None else tilt_telemetry_sign * tilt_command(pitch_error)
        print(
            f"{label} yaw {latest_yaw:+.1f}->{desired_yaw:+.1f} "
            f"pitch {latest_pitch:+.1f}->{desired_pitch:+.1f} pan {pan:+d} tilt {tilt:+d}",
            flush=True,
        )
        if pan == 0 and tilt == 0:
            await stop_motion()
            return True
        end = time.monotonic() + 0.22
        while time.monotonic() < end:
            if latest_yaw is not None:
                pan = pan_command(abs_pan.angle_error(desired_yaw, latest_yaw))
            if latest_pitch is not None and tilt_telemetry_sign is not None:
                pitch_error = abs_pan.angle_error(desired_pitch, latest_pitch)
                tilt = tilt_telemetry_sign * tilt_command(pitch_error)
            try:
                await send_axes(tilt, pan)
            except Exception:
                await ensure_ble("RS 4 link dropped during movement - reconnecting...")
                return False
            await asyncio.sleep(0.05)
        yaw_ok = abs(abs_pan.angle_error(desired_yaw, latest_yaw)) <= PAN_TOLERANCE_DEG
        pitch_ok = tilt_telemetry_sign is None or abs(abs_pan.angle_error(desired_pitch, latest_pitch)) <= TILT_TOLERANCE_DEG
        if yaw_ok and pitch_ok:
            await stop_motion()
        return yaw_ok and pitch_ok

    async def return_home(label="RETURNING TO TOWER HOME..."):
        print(label, flush=True)
        start = time.monotonic()
        while time.monotonic() - start < HOME_TIMEOUT_SECONDS:
            if await drive_once(home_yaw, home_pitch, "HOME"):
                print(f"TOWER HOME REACHED yaw {latest_yaw:+.1f} pitch {latest_pitch:+.1f}", flush=True)
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
                selection = abs_pan.current_selection(engine)
            except Exception:
                selection = None
            if selection and selection.get("hex") in recent:
                selection = None
            if selection:
                try:
                    target = await asyncio.wait_for(asyncio.to_thread(tracker.local_target, selection), 0.8)
                except Exception:
                    target = None
                if target and target["distance"] <= LOCK_RANGE_KM:
                    return selection
                if target:
                    print(f"CURRENT {target['callsign']} {target['distance']:.1f} km - waiting for 12 km", flush=True)
                else:
                    print("Waiting for CURRENT in local ADS-B...", flush=True)
            else:
                print("At TOWER HOME - waiting for a new ribbon CURRENT...", flush=True)
            await stop_motion()
            await asyncio.sleep(WAIT_SECONDS)

    def target_is_on_ground(selection):
        try:
            feed = tracker.read_local_feed()
        except Exception:
            return False
        for ac in feed.get("aircraft") or []:
            if tracker.clean_hex(ac.get("hex")) != selection.get("hex"):
                continue
            return ac.get("alt_baro") == "ground" or ac.get("alt_geom") == "ground"
        return False

    async def track_one(selection):
        print(f"LOCKED {selection['callsign']} - committed through landing (up to 5 minutes)", flush=True)
        started = time.monotonic()
        missing_since = None
        while time.monotonic() - started < MAX_TRACK_SECONDS:
            await ensure_ble()
            try:
                target = await asyncio.wait_for(asyncio.to_thread(tracker.local_target, selection), 0.8)
            except Exception:
                target = None
            if target is None:
                if missing_since is None:
                    missing_since = time.monotonic()
                await stop_motion()
                if time.monotonic() - missing_since > 5.0:
                    print("Target lost from local ADS-B for 5 seconds. Ending track.", flush=True)
                    break
                await asyncio.sleep(0.25)
                continue
            missing_since = None
            if await asyncio.to_thread(target_is_on_ground, selection):
                print("Target has landed. Ending track.", flush=True)
                break
            if target["distance"] > DROP_RANGE_KM:
                print("Target left the 14 km tracking area. Ending track.", flush=True)
                break
            relative_pan = abs_pan.wrap180(target["bearing"] - tower_bearing)
            if abs(relative_pan) > abs_pan.MAX_RELATIVE_PAN_DEG:
                print("Target left safe pan sector. Ending track.", flush=True)
                break
            relative_tilt = max(-MAX_RELATIVE_TILT_DEG, min(MAX_RELATIVE_TILT_DEG, target["elevation"] - TOWER_HOME_ELEVATION_DEG))
            desired_yaw = abs_pan.wrap180(home_yaw + relative_pan)
            desired_pitch = home_pitch if tilt_telemetry_sign is None else abs_pan.wrap180(home_pitch + tilt_telemetry_sign * relative_tilt)
            on_target = await drive_once(desired_yaw, desired_pitch, selection["callsign"])
            print(
                f"LOCAL {target['callsign']} {target['distance']:.2f} km bearing {target['bearing']:.1f} "
                f"elevation {target['elevation']:.1f} {'ON_TARGET' if on_target else 'CORRECTING'}",
                flush=True,
            )
            await asyncio.sleep(0.10)
        if time.monotonic() - started >= MAX_TRACK_SECONDS:
            print("Five-minute safety limit reached. Ending track.", flush=True)
        await stop_motion()

    try:
        await connect_ble()
        await stop_motion()
        home_pitch = latest_pitch
        home_yaw = latest_yaw
        print(f"TOWER HOME CAPTURED yaw {home_yaw:+.1f} pitch {home_pitch:+.1f}", flush=True)
        await calibrate_tilt_direction()
        if tilt_telemetry_sign is not None:
            if not await return_home("Calibration complete. Returning exactly to TOWER HOME..."):
                raise RuntimeError("Could not restore HOME after tilt calibration")
        print("Full continuous test ready.", flush=True)
        while True:
            selection = await wait_for_selection()
            await track_one(selection)
            if selection.get("hex"):
                recent[selection["hex"]] = time.monotonic() + RECENT_SECONDS
            if not await return_home("AIRCRAFT TRACK COMPLETE. RETURNING TO TOWER..."):
                break
            print("At TOWER HOME. Waiting for the next CURRENT...", flush=True)
            await asyncio.sleep(WAIT_SECONDS)
    except KeyboardInterrupt:
        print("Stopped by user.", flush=True)
    except Exception as error:
        print("FULL TRACKER:", type(error).__name__, str(error), flush=True)
    finally:
        try:
            await stop_motion()
        except Exception:
            pass
        await disconnect_ble()
        print("Finished.", flush=True)


if __name__ == "__main__":
    asyncio.run(main())
