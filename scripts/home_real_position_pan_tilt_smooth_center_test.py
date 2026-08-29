#!/usr/bin/env python3
import asyncio
import math
import struct
import time

from bleak import BleakClient

import home_real_position_pan_tilt_test as geom
import home_real_position_pan_tilt_resilient_test as resilient

# Same proven camera/Hornbach geometry. This version changes only HOW the RS4 moves.
LOCK_RANGE_KM = 12.0
MAX_TRACK_SECONDS = 180.0
TARGET_REFRESH_SECONDS = 0.22
CONTROL_SECONDS = 0.05
PAN_DEADBAND = 0.18
TILT_DEADBAND = 0.22
MAX_RELATIVE_PAN_DEG = 150.0
MAX_UP_ELEV_DEG = 18.0
MAX_DOWN_ELEV_DEG = 5.0
HOME_TIMEOUT_SECONDS = 25.0

# Small motion prediction. It leads in the aircraft's actual direction of travel,
# so an aircraft moving left is led left and one moving right is led right.
LEAD_SECONDS = 0.75
MAX_LEAD_DEG = 1.6


def wrap180(v):
    return (v + 180.0) % 360.0 - 180.0


def angle_error(target, current):
    return wrap180(target - current)


def axis_speed(error, deadband, max_speed):
    m = abs(error)
    if m <= deadband:
        return 0
    # Gentle proportional control, capped so it does not snap around the frame.
    speed = int(18 + min(max_speed - 18, m * 15.0))
    return speed if error > 0 else -speed


def clean_hex(v):
    return str(v or "").strip().lower()


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


async def main():
    print("SMOOTH CENTER TRACK - REAL HOME PAN + TILT", flush=True)
    print("Hornbach HOME geometry unchanged. Continuous 20 Hz control with gentle motion prediction.", flush=True)
    print("Ctrl+C stops immediately.", flush=True)

    client = None
    tx_char = None
    sequence = 0xC100
    latest_yaw = None
    latest_pitch = None
    home_yaw = None
    home_pitch = None

    def receive(sender, data):
        nonlocal latest_yaw, latest_pitch
        b = bytes(data)
        if len(b) < 19 or b[0] != 0x55 or b[9] != 0x04 or b[10] != 0x05:
            return
        payload = b[11:-2]
        if len(payload) < 6:
            return
        try:
            pitch_raw, _, yaw_raw = struct.unpack_from("<hhh", payload, 0)
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

    async def connect_ble(label="RS 4 connected"):
        nonlocal client, tx_char, latest_yaw, latest_pitch, home_yaw, home_pitch
        old_yaw, old_pitch = latest_yaw, latest_pitch
        had_home = home_yaw is not None and home_pitch is not None
        await disconnect_ble()
        latest_yaw = None
        latest_pitch = None
        last_error = None
        for attempt in range(1, 6):
            try:
                client = BleakClient(geom.base.DEVICE, timeout=20)
                await asyncio.wait_for(client.connect(), 25)
                await asyncio.sleep(0.8)
                await asyncio.wait_for(client.start_notify(geom.base.RX, receive), 6)
                tx_char = client.services.get_characteristic(geom.base.TX)
                if tx_char is None:
                    raise RuntimeError("RS 4 TX characteristic not found")
                deadline = time.monotonic() + 4.0
                while (latest_yaw is None or latest_pitch is None) and time.monotonic() < deadline:
                    await asyncio.sleep(0.05)
                if latest_yaw is None or latest_pitch is None:
                    raise RuntimeError("No RS 4 telemetry")
                if had_home and old_yaw is not None and old_pitch is not None:
                    home_yaw = wrap180(home_yaw + angle_error(latest_yaw, old_yaw))
                    home_pitch = wrap180(home_pitch + angle_error(latest_pitch, old_pitch))
                print(f"{label} (attempt {attempt})", flush=True)
                return
            except Exception as exc:
                last_error = exc
                await disconnect_ble()
                if attempt < 5:
                    await asyncio.sleep(1.5)
        raise RuntimeError(f"Could not connect RS 4: {last_error}")

    async def ensure_ble():
        if client is not None and client.is_connected and tx_char is not None:
            return
        print("RS 4 link dropped - reconnecting...", flush=True)
        await connect_ble("RS 4 reconnected")

    async def send(tilt, pan):
        nonlocal sequence
        await ensure_ble()
        sequence += 1
        await client.write_gatt_char(tx_char, geom.base.packet(sequence, tilt, pan), response=False)

    async def stop_motion():
        if client is None or tx_char is None or not client.is_connected:
            return
        for _ in range(3):
            try:
                await send(0, 0)
            except Exception:
                break
            await asyncio.sleep(0.04)

    async def return_home():
        print("RETURNING TO HORNBACH HOME...", flush=True)
        start = time.monotonic()
        while time.monotonic() - start < HOME_TIMEOUT_SECONDS:
            await ensure_ble()
            if latest_yaw is None or latest_pitch is None:
                await asyncio.sleep(CONTROL_SECONDS)
                continue
            ye = angle_error(home_yaw, latest_yaw)
            pe = angle_error(home_pitch, latest_pitch)
            pan = axis_speed(ye, 0.35, 80)
            # camera UP = DJI pitch decreases, hence pitch command sign inversion
            tilt = -axis_speed(pe, 0.35, 65)
            await send(tilt, pan)
            if abs(ye) <= 0.35 and abs(pe) <= 0.35:
                await stop_motion()
                print(f"HORNBACH HOME REACHED yaw {latest_yaw:+.1f} pitch {latest_pitch:+.1f}", flush=True)
                return True
            await asyncio.sleep(CONTROL_SECONDS)
        await stop_motion()
        print("HOME RETURN TIMEOUT - stopped safely.", flush=True)
        return False

    try:
        await connect_ble()
        await stop_motion()
        home_yaw, home_pitch = latest_yaw, latest_pitch
        print(f"HORNBACH HOME CAPTURED yaw {home_yaw:+.1f} pitch {home_pitch:+.1f}", flush=True)
        print("Waiting for ribbon CURRENT inside 12 km from camera...", flush=True)

        selection = None
        target = None
        while selection is None:
            try:
                engine = await asyncio.to_thread(geom.base.fetch_engine)
                candidate = ribbon_current(engine)
            except Exception:
                candidate = None
            if candidate:
                try:
                    t = await asyncio.to_thread(resilient.resilient_target, candidate)
                except Exception:
                    t = None
                if t and t["distance"] <= LOCK_RANGE_KM:
                    selection, target = candidate, t
                    break
                if t:
                    print(f"CURRENT {t['callsign']} {t['distance']:.1f} km - waiting for 12 km", flush=True)
                else:
                    print("CURRENT found - waiting for position...", flush=True)
            else:
                print("Waiting for ribbon CURRENT...", flush=True)
            await stop_motion()
            await asyncio.sleep(0.7)

        print(f"LOCKED {selection['callsign']} - smooth centre tracking", flush=True)
        started = time.monotonic()
        next_target_refresh = 0.0
        previous_target = None
        previous_target_time = None
        desired_yaw = home_yaw
        desired_pitch = home_pitch
        target_missing_since = None
        ribbon_check_at = 0.0

        while time.monotonic() - started < MAX_TRACK_SECONDS:
            now = time.monotonic()
            await ensure_ble()

            if now >= ribbon_check_at:
                ribbon_check_at = now + 1.0
                try:
                    engine = await asyncio.to_thread(geom.base.fetch_engine)
                    cur = ribbon_current(engine)
                except Exception:
                    cur = None
                if cur and clean_hex(cur.get("hex")) != selection["hex"]:
                    print(f"Ribbon changed to {cur.get('callsign') or 'another aircraft'} - ending track.", flush=True)
                    break

            if now >= next_target_refresh:
                next_target_refresh = now + TARGET_REFRESH_SECONDS
                try:
                    new_target = await asyncio.to_thread(resilient.resilient_target, selection)
                except Exception:
                    new_target = None

                if new_target is None:
                    if target_missing_since is None:
                        target_missing_since = now
                    if now - target_missing_since > 4.0:
                        print("Target position lost for 4 seconds - ending track.", flush=True)
                        break
                else:
                    target_missing_since = None
                    target = new_target
                    bearing = target["bearing"]
                    elevation = target["elevation"]

                    lead = 0.0
                    if previous_target is not None and previous_target_time is not None:
                        dt = max(0.15, now - previous_target_time)
                        rate = wrap180(bearing - previous_target["bearing"]) / dt
                        lead = max(-MAX_LEAD_DEG, min(MAX_LEAD_DEG, rate * LEAD_SECONDS))

                    predicted_bearing = wrap180(bearing + lead)
                    relative_pan = wrap180(predicted_bearing - geom.REFERENCE_BEARING_DEG)
                    if abs(relative_pan) > MAX_RELATIVE_PAN_DEG:
                        print("Target left safe pan sector - ending track.", flush=True)
                        break

                    elevation = max(-MAX_DOWN_ELEV_DEG, min(MAX_UP_ELEV_DEG, elevation))
                    desired_yaw = wrap180(home_yaw + relative_pan)
                    desired_pitch = wrap180(home_pitch - (elevation - geom.HOME_REFERENCE_ELEV_DEG))

                    print(
                        f"{target['callsign']} {target['distance']:.2f} km bearing {bearing:.1f} lead {lead:+.2f} "
                        f"elev {target['elevation']:.1f}",
                        flush=True,
                    )
                    previous_target = target
                    previous_target_time = now

            if latest_yaw is not None and latest_pitch is not None:
                ye = angle_error(desired_yaw, latest_yaw)
                pe = angle_error(desired_pitch, latest_pitch)
                pan = axis_speed(ye, PAN_DEADBAND, 85)
                tilt = -axis_speed(pe, TILT_DEADBAND, 65)
                try:
                    await send(tilt, pan)
                except Exception:
                    await ensure_ble()
                await asyncio.sleep(CONTROL_SECONDS)
            else:
                await asyncio.sleep(CONTROL_SECONDS)

        await stop_motion()
        await return_home()
        print("SMOOTH CENTER TEST COMPLETE.", flush=True)

    except KeyboardInterrupt:
        print("Stopped by user.", flush=True)
    except Exception as exc:
        print("SMOOTH CENTER TEST:", type(exc).__name__, str(exc), flush=True)
    finally:
        try:
            await stop_motion()
        except Exception:
            pass
        await disconnect_ble()
        print("Finished.", flush=True)


if __name__ == "__main__":
    asyncio.run(main())
