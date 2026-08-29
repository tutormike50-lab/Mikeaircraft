#!/usr/bin/env python3
import asyncio
import struct
import time

from bleak import BleakClient

import virtual_hill_tracker as base
import virtual_hill_local as local

# Real camera position from iPhone Compass at Makovskeho / Repy.
CAMERA_LAT = 50.0652778
CAMERA_LON = 14.3041667
CAMERA_ALT_M = 360.0

# Hornbach sign is centred in the Canon at this true heading.
REFERENCE_BEARING_DEG = 16.0

LOCK_RANGE_KM = 12.0
TRACK_SECONDS = 75.0
PAN_TOLERANCE_DEG = 1.5
HOME_TIMEOUT_SECONDS = 20.0
MAX_RELATIVE_PAN_DEG = 150.0


def wrap180(value):
    return (value + 180.0) % 360.0 - 180.0


def angle_error(target, current):
    return wrap180(target - current)


def pan_command(error):
    m = abs(error)
    if m <= PAN_TOLERANCE_DEG:
        return 0
    if m > 60:
        speed = 180
    elif m > 30:
        speed = 140
    elif m > 15:
        speed = 100
    elif m > 7:
        speed = 70
    elif m > 3:
        speed = 45
    else:
        speed = 25
    return speed if error > 0 else -speed


def clean_hex(value):
    return str(value or "").strip().lower()


def ribbon_current(engine):
    cur = (engine.get("intelligence") or {}).get("current") or {}
    hx = clean_hex(cur.get("hex") or cur.get("id"))
    if not hx:
        return None
    return {
        "hex": hx,
        "id": cur.get("id") or hx,
        "callsign": str(cur.get("callsign") or hx).strip(),
        "state": str(cur.get("state") or "CURRENT").strip().upper(),
    }


def real_local_target(selection):
    feed = local.read_local_feed()
    for ac in feed.get("aircraft") or []:
        if clean_hex(ac.get("hex")) != selection["hex"]:
            continue

        lat = ac.get("lat")
        lon = ac.get("lon")
        if not isinstance(lat, (int, float)) or not isinstance(lon, (int, float)):
            return None
        if abs(lat) < 1 or abs(lon) < 1:
            return None

        distance = base.haversine_km(CAMERA_LAT, CAMERA_LON, lat, lon)
        bearing = base.bearing_deg(CAMERA_LAT, CAMERA_LON, lat, lon)
        callsign = str(ac.get("flight") or selection.get("callsign") or selection["hex"]).strip()
        return {
            "callsign": callsign,
            "distance": distance,
            "bearing": bearing,
        }
    return None


async def main():
    print("REAL HOME POSITION PAN HOLD TEST", flush=True)
    print(f"Camera: {CAMERA_LAT:.7f}, {CAMERA_LON:.7f}  alt {CAMERA_ALT_M:.0f} m", flush=True)
    print(f"Hornbach reference bearing: {REFERENCE_BEARING_DEG:.1f} deg", flush=True)
    print(f"PAN ONLY - TILT DISABLED. Same aircraft held for up to {TRACK_SECONDS:.0f} seconds.", flush=True)

    client = None
    tx_char = None
    sequence = 0xA500
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

    async def connect_ble(label="RS 4 connected"):
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
                    raise RuntimeError("RS 4 Bluetooth message size too small")

                deadline = time.monotonic() + 4.0
                while latest_yaw is None and time.monotonic() < deadline:
                    await asyncio.sleep(0.05)
                if latest_yaw is None:
                    raise RuntimeError("No RS 4 yaw telemetry")

                print(f"{label} (attempt {attempt})", flush=True)
                return
            except Exception as exc:
                last_error = exc
                await disconnect_ble()
                if attempt < 5:
                    await asyncio.sleep(2.0)
        raise RuntimeError(f"Could not connect RS 4: {last_error}")

    async def ensure_ble():
        if client is not None and client.is_connected and tx_char is not None:
            return
        print("RS 4 link dropped - reconnecting...", flush=True)
        await connect_ble("RS 4 reconnected")

    async def send_pan(pan):
        nonlocal sequence
        await ensure_ble()
        seq = sequence
        sequence += 1
        # Tilt is ALWAYS zero in this test.
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

        err = angle_error(desired_yaw, latest_yaw)
        cmd = pan_command(err)
        print(f"{label} desired {desired_yaw:+.1f} actual {latest_yaw:+.1f} error {err:+.1f} pan {cmd:+d}", flush=True)

        if cmd == 0:
            await stop_motion()
            return True

        end = time.monotonic() + 0.20
        while time.monotonic() < end:
            if latest_yaw is not None:
                err = angle_error(desired_yaw, latest_yaw)
                cmd = pan_command(err)
                if cmd == 0:
                    break
            try:
                await send_pan(cmd)
            except Exception:
                await ensure_ble()
                return False
            await asyncio.sleep(0.05)

        await stop_motion()
        return latest_yaw is not None and abs(angle_error(desired_yaw, latest_yaw)) <= PAN_TOLERANCE_DEG

    async def return_home():
        print("RETURNING TO HORNBACH HOME...", flush=True)
        start = time.monotonic()
        while time.monotonic() - start < HOME_TIMEOUT_SECONDS:
            reached = await drive_once(home_yaw, "HOME")
            if reached:
                print(f"HORNBACH HOME REACHED yaw {latest_yaw:+.1f}", flush=True)
                return True
            await asyncio.sleep(0.08)
        await stop_motion()
        print("HOME RETURN TIMEOUT - stopped safely.", flush=True)
        return False

    try:
        await connect_ble()
        await stop_motion()
        home_yaw = latest_yaw
        print(f"HORNBACH HOME CAPTURED yaw {home_yaw:+.1f} deg", flush=True)
        print("Waiting for ribbon CURRENT with a local position inside 12 km...", flush=True)

        selection = None
        while selection is None:
            try:
                engine = await asyncio.to_thread(base.fetch_engine)
                candidate = ribbon_current(engine)
            except Exception:
                candidate = None

            if candidate:
                try:
                    target = await asyncio.to_thread(real_local_target, candidate)
                except Exception:
                    target = None
                if target and target["distance"] <= LOCK_RANGE_KM:
                    selection = candidate
                    break
                if target:
                    print(f"CURRENT {target['callsign']} {target['distance']:.1f} km from CAMERA - waiting for 12.0 km", flush=True)
                else:
                    print("Ribbon CURRENT has no fresh local position yet...", flush=True)
            else:
                print("Waiting for ribbon CURRENT...", flush=True)

            await stop_motion()
            await asyncio.sleep(0.8)

        print(f"LOCKED {selection['callsign']} {selection['state']} - committed for up to {TRACK_SECONDS:.0f} seconds", flush=True)
        track_start = time.monotonic()
        missing_since = None

        while time.monotonic() - track_start < TRACK_SECONDS:
            try:
                target = await asyncio.to_thread(real_local_target, selection)
            except Exception:
                target = None

            if target is None:
                if missing_since is None:
                    missing_since = time.monotonic()
                await stop_motion()
                print("Target temporarily missing from local ADS-B...", flush=True)
                if time.monotonic() - missing_since > 5.0:
                    print("Target missing for more than 5 seconds. Ending track.", flush=True)
                    break
                await asyncio.sleep(0.35)
                continue

            missing_since = None
            relative = wrap180(target["bearing"] - REFERENCE_BEARING_DEG)
            if abs(relative) > MAX_RELATIVE_PAN_DEG:
                print(f"Target {relative:+.1f} deg from Hornbach - outside safe sector. Ending track.", flush=True)
                break

            desired_yaw = wrap180(home_yaw + relative)
            reached = await drive_once(desired_yaw, selection["callsign"])
            elapsed = time.monotonic() - track_start
            print(
                f"REAL {target['callsign']} {target['distance']:.2f} km  bearing {target['bearing']:.1f} deg  "
                f"Hornbach offset {relative:+.1f} deg  {'ON_TARGET' if reached else 'CORRECTING'}  {elapsed:.0f}s",
                flush=True,
            )
            await asyncio.sleep(0.10)

        await stop_motion()
        await return_home()
        print("TEST COMPLETE - stopped after one committed aircraft.", flush=True)

    except KeyboardInterrupt:
        print("Stopped by user.", flush=True)
    except Exception as exc:
        print("REAL POSITION HOLD TEST:", type(exc).__name__, str(exc), flush=True)
    finally:
        try:
            await stop_motion()
        except Exception:
            pass
        await disconnect_ble()
        print("Finished.", flush=True)


if __name__ == "__main__":
    asyncio.run(main())
