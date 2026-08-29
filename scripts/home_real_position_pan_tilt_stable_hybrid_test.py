#!/usr/bin/env python3
import asyncio
import struct
import time

from bleak import BleakClient

import home_real_position_pan_tilt_test as geom
import home_real_position_pan_tilt_resilient_test as resilient

# Stable hybrid test:
# - same proven real camera/Hornbach geometry
# - filtered aircraft bearing/elevation (no predictive lead yet)
# - gentle continuous tracking commands
# - exact two-stage HOME: smooth coarse return, then short settle/recheck bursts

LOCK_RANGE_KM = 12.0
MAX_TRACK_SECONDS = 180.0
TARGET_REFRESH_SECONDS = 0.30
CONTROL_SECONDS = 0.05
RIBBON_CHECK_SECONDS = 1.0
MAX_RELATIVE_PAN_DEG = 150.0
MAX_UP_ELEV_DEG = 18.0
MAX_DOWN_ELEV_DEG = 5.0

PAN_DEADBAND = 0.35
TILT_DEADBAND = 0.65
BEARING_ALPHA = 0.30
ELEVATION_ALPHA = 0.22

HOME_COARSE_ZONE_DEG = 2.0
HOME_FINE_TOLERANCE_DEG = 0.18
HOME_TIMEOUT_SECONDS = 30.0


def wrap180(v):
    return (v + 180.0) % 360.0 - 180.0


def angle_error(target, current):
    return wrap180(target - current)


def smooth_angle(previous, new_value, alpha):
    if previous is None:
        return new_value
    return wrap180(previous + alpha * angle_error(new_value, previous))


def tracking_pan_speed(error):
    m = abs(error)
    if m <= PAN_DEADBAND:
        return 0
    # Much gentler near centre than the earlier 18+ command floor.
    if m > 12:
        speed = 70
    elif m > 6:
        speed = 52
    elif m > 3:
        speed = 36
    elif m > 1.5:
        speed = 24
    elif m > 0.7:
        speed = 14
    else:
        speed = 8
    return speed if error > 0 else -speed


def tracking_tilt_speed(pitch_error):
    m = abs(pitch_error)
    if m <= TILT_DEADBAND:
        return 0
    if m > 6:
        speed = 42
    elif m > 3:
        speed = 30
    elif m > 1.5:
        speed = 20
    else:
        speed = 10
    # Physical camera UP = DJI pitch decreases.
    # Positive DJI tilt command moves camera UP, so invert telemetry error.
    return -speed if pitch_error > 0 else speed


def home_coarse_pan(error):
    m = abs(error)
    if m > 20:
        speed = 90
    elif m > 8:
        speed = 65
    elif m > 4:
        speed = 45
    else:
        speed = 28
    return speed if error > 0 else -speed


def home_coarse_tilt(error):
    m = abs(error)
    if m > 8:
        speed = 55
    elif m > 4:
        speed = 38
    else:
        speed = 24
    return -speed if error > 0 else speed


def home_fine_pan(error):
    m = abs(error)
    if m <= HOME_FINE_TOLERANCE_DEG:
        return 0
    if m > 1.0:
        speed = 24
    elif m > 0.45:
        speed = 14
    else:
        speed = 8
    return speed if error > 0 else -speed


def home_fine_tilt(error):
    m = abs(error)
    if m <= HOME_FINE_TOLERANCE_DEG:
        return 0
    if m > 1.0:
        speed = 20
    elif m > 0.45:
        speed = 12
    else:
        speed = 7
    return -speed if error > 0 else speed


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
    print("STABLE HYBRID TRACK - FILTERED PAN/TILT + EXACT HOME", flush=True)
    print("No predictive lead in this test. First priority: stop hunting and preserve exact HOME.", flush=True)
    print("Ctrl+C stops immediately.", flush=True)

    client = None
    tx_char = None
    sequence = 0xD100
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

                # Preserve the physical Hornbach HOME across DJI telemetry-zero shifts.
                if had_home and old_yaw is not None and old_pitch is not None:
                    home_yaw = wrap180(home_yaw + angle_error(latest_yaw, old_yaw))
                    home_pitch = wrap180(home_pitch + angle_error(latest_pitch, old_pitch))
                    print(f"HOME reference preserved after reconnect: yaw {home_yaw:+.1f} pitch {home_pitch:+.1f}", flush=True)

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
        for _ in range(5):
            try:
                await send(0, 0)
            except Exception:
                break
            await asyncio.sleep(0.04)

    async def fine_burst(pan, tilt):
        # Short, deliberate burst followed by a full stop and settle/re-read.
        end = time.monotonic() + 0.10
        while time.monotonic() < end:
            await send(tilt, pan)
            await asyncio.sleep(0.05)
        await stop_motion()
        await asyncio.sleep(0.14)

    async def return_home():
        print("RETURNING TO EXACT HORNBACH HOME...", flush=True)
        started = time.monotonic()

        # Stage 1: smooth coarse return.
        while time.monotonic() - started < HOME_TIMEOUT_SECONDS:
            await ensure_ble()
            if latest_yaw is None or latest_pitch is None:
                await asyncio.sleep(CONTROL_SECONDS)
                continue

            ye = angle_error(home_yaw, latest_yaw)
            pe = angle_error(home_pitch, latest_pitch)
            if abs(ye) <= HOME_COARSE_ZONE_DEG and abs(pe) <= HOME_COARSE_ZONE_DEG:
                await stop_motion()
                await asyncio.sleep(0.15)
                break

            pan = 0 if abs(ye) <= HOME_COARSE_ZONE_DEG else home_coarse_pan(ye)
            tilt = 0 if abs(pe) <= HOME_COARSE_ZONE_DEG else home_coarse_tilt(pe)
            await send(tilt, pan)
            await asyncio.sleep(CONTROL_SECONDS)

        # Stage 2: proven settle/recheck behaviour for the final small error.
        for _ in range(30):
            if latest_yaw is None or latest_pitch is None:
                await asyncio.sleep(0.10)
                continue
            ye = angle_error(home_yaw, latest_yaw)
            pe = angle_error(home_pitch, latest_pitch)
            if abs(ye) <= HOME_FINE_TOLERANCE_DEG and abs(pe) <= HOME_FINE_TOLERANCE_DEG:
                await stop_motion()
                print(
                    f"HORNBACH HOME REACHED yaw {latest_yaw:+.1f} pitch {latest_pitch:+.1f} "
                    f"error yaw {ye:+.1f} pitch {pe:+.1f}",
                    flush=True,
                )
                return True

            pan = home_fine_pan(ye)
            tilt = home_fine_tilt(pe)
            print(f"HOME FINE yaw error {ye:+.2f} pitch error {pe:+.2f} pan {pan:+d} tilt {tilt:+d}", flush=True)
            await fine_burst(pan, tilt)

        await stop_motion()
        print("HOME FINE RETURN TIMEOUT - stopped safely.", flush=True)
        return False

    try:
        await connect_ble()
        await stop_motion()
        home_yaw, home_pitch = latest_yaw, latest_pitch
        print(f"HORNBACH HOME CAPTURED yaw {home_yaw:+.1f} pitch {home_pitch:+.1f}", flush=True)
        print("Waiting for ribbon CURRENT inside 12 km from camera...", flush=True)

        selection = None
        while selection is None:
            try:
                engine = await asyncio.to_thread(geom.base.fetch_engine)
                candidate = ribbon_current(engine)
            except Exception:
                candidate = None

            if candidate:
                try:
                    target = await asyncio.to_thread(resilient.resilient_target, candidate)
                except Exception:
                    target = None
                if target and target["distance"] <= LOCK_RANGE_KM:
                    selection = candidate
                    break
                if target:
                    print(f"CURRENT {target['callsign']} {target['distance']:.1f} km - waiting for 12 km", flush=True)
                else:
                    print("CURRENT found - waiting for position...", flush=True)
            else:
                print("Waiting for ribbon CURRENT...", flush=True)

            await stop_motion()
            await asyncio.sleep(0.7)

        print(f"LOCKED {selection['callsign']} - stable filtered tracking", flush=True)
        started = time.monotonic()
        next_target_refresh = 0.0
        next_ribbon_check = 0.0
        target_missing_since = None
        filtered_bearing = None
        filtered_elevation = None
        desired_yaw = home_yaw
        desired_pitch = home_pitch

        while time.monotonic() - started < MAX_TRACK_SECONDS:
            now = time.monotonic()
            await ensure_ble()

            if now >= next_ribbon_check:
                next_ribbon_check = now + RIBBON_CHECK_SECONDS
                try:
                    engine = await asyncio.to_thread(geom.base.fetch_engine)
                    current = ribbon_current(engine)
                except Exception:
                    current = None
                if current and clean_hex(current.get("hex")) != selection["hex"]:
                    print(f"Ribbon changed to {current.get('callsign') or 'another aircraft'} - ending track.", flush=True)
                    break

            if now >= next_target_refresh:
                next_target_refresh = now + TARGET_REFRESH_SECONDS
                try:
                    target = await asyncio.to_thread(resilient.resilient_target, selection)
                except Exception:
                    target = None

                if target is None:
                    if target_missing_since is None:
                        target_missing_since = now
                    if now - target_missing_since > 4.0:
                        print("Target position lost for 4 seconds - ending track.", flush=True)
                        break
                else:
                    target_missing_since = None
                    filtered_bearing = smooth_angle(filtered_bearing, target["bearing"], BEARING_ALPHA)
                    if filtered_elevation is None:
                        filtered_elevation = target["elevation"]
                    else:
                        filtered_elevation += ELEVATION_ALPHA * (target["elevation"] - filtered_elevation)

                    relative_pan = wrap180(filtered_bearing - geom.REFERENCE_BEARING_DEG)
                    if abs(relative_pan) > MAX_RELATIVE_PAN_DEG:
                        print("Target left safe pan sector - ending track.", flush=True)
                        break

                    filtered_elevation = max(-MAX_DOWN_ELEV_DEG, min(MAX_UP_ELEV_DEG, filtered_elevation))
                    desired_yaw = wrap180(home_yaw + relative_pan)
                    desired_pitch = wrap180(home_pitch - (filtered_elevation - geom.HOME_REFERENCE_ELEV_DEG))

                    print(
                        f"{target['callsign']} {target['distance']:.2f} km "
                        f"bearing {target['bearing']:.1f}->{filtered_bearing:.1f} "
                        f"elev {target['elevation']:.1f}->{filtered_elevation:.1f}",
                        flush=True,
                    )

            if latest_yaw is not None and latest_pitch is not None:
                ye = angle_error(desired_yaw, latest_yaw)
                pe = angle_error(desired_pitch, latest_pitch)
                pan = tracking_pan_speed(ye)
                tilt = tracking_tilt_speed(pe)
                try:
                    await send(tilt, pan)
                except Exception:
                    await ensure_ble()
                await asyncio.sleep(CONTROL_SECONDS)
            else:
                await asyncio.sleep(CONTROL_SECONDS)

        await stop_motion()
        await return_home()
        print("STABLE HYBRID TEST COMPLETE.", flush=True)

    except KeyboardInterrupt:
        print("Stopped by user.", flush=True)
    except Exception as exc:
        print("STABLE HYBRID TEST:", type(exc).__name__, str(exc), flush=True)
    finally:
        try:
            await stop_motion()
        except Exception:
            pass
        await disconnect_ble()
        print("Finished.", flush=True)


if __name__ == "__main__":
    asyncio.run(main())
