#!/usr/bin/env python3
import asyncio
import json
import math
import struct
import time
import urllib.request
from bleak import BleakClient

TX = "0000fff5-0000-1000-8000-00805f9b34fb"
DEVICE = "0C:9A:E6:FC:8E:73"
ENGINE_URL = "https://mikeaircraft.vercel.app/api/engine?airport=PRG"

# Virtual test position: Hostivice spotting mound
HILL_LAT = 50.1032222
HILL_LON = 14.2501389
HILL_ALT_M = 358.0
LOCK_RANGE_KM = 8.0
DROP_RANGE_KM = 10.0
MAX_TRACK_SECONDS = 45.0
SAMPLE_SECONDS = 0.55
PAN_RATE_SCALE = 90.0
TILT_RATE_SCALE = 110.0
MIN_COMMAND = 60
MAX_COMMAND = 360


def crc(data):
    value = 0x3692
    for byte in data:
        value ^= byte
        for _ in range(8):
            value = (value >> 1) ^ (0x8408 if value & 1 else 0)
    return value


def packet(seq, tilt, pan):
    data = bytes.fromhex("55 16 04 fc 02 04")
    data += struct.pack("<H", seq) + bytes.fromhex("40 04 01")
    data += struct.pack("<hhh", 1024 + tilt, 1024, 1024 + pan)
    data += bytes.fromhex("00 00 02")
    return data + struct.pack("<H", crc(data))


def clamp_command(value):
    if abs(value) < 1:
        return 0
    sign = 1 if value > 0 else -1
    magnitude = max(MIN_COMMAND, min(MAX_COMMAND, int(abs(value))))
    return sign * magnitude


def haversine_km(lat1, lon1, lat2, lon2):
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def bearing_deg(lat1, lon1, lat2, lon2):
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dl = math.radians(lon2 - lon1)
    y = math.sin(dl) * math.cos(p2)
    x = math.cos(p1) * math.sin(p2) - math.sin(p1) * math.cos(p2) * math.cos(dl)
    return (math.degrees(math.atan2(y, x)) + 360.0) % 360.0


def angle_delta(new, old):
    return (new - old + 180.0) % 360.0 - 180.0


def elevation_deg(distance_km, altitude_ft):
    if distance_km <= 0.01:
        return 0.0
    target_m = float(altitude_ft or 0) * 0.3048
    return math.degrees(math.atan2(target_m - HILL_ALT_M, distance_km * 1000.0))


def fetch_engine():
    req = urllib.request.Request(ENGINE_URL, headers={"User-Agent": "MikeAircraft-Virtual-Hill"})
    with urllib.request.urlopen(req, timeout=6) as response:
        return json.loads(response.read().decode("utf-8"))


def current_target(data):
    intel = data.get("intelligence") or {}
    current = intel.get("current") or {}
    current_id = current.get("id") or current.get("hex")
    if not current_id:
        return None
    for ac in intel.get("aircraft") or []:
        if (ac.get("id") or ac.get("hex")) != current_id:
            continue
        lat, lon = ac.get("lat"), ac.get("lon")
        if not isinstance(lat, (int, float)) or not isinstance(lon, (int, float)):
            return None
        if abs(lat) < 1 or abs(lon) < 1:
            return None
        distance = haversine_km(HILL_LAT, HILL_LON, lat, lon)
        bearing = bearing_deg(HILL_LAT, HILL_LON, lat, lon)
        elevation = elevation_deg(distance, ac.get("altitude"))
        return {
            "id": current_id,
            "callsign": ac.get("callsign") or current.get("callsign") or current_id,
            "distance": distance,
            "bearing": bearing,
            "elevation": elevation,
            "state": ac.get("state") or current.get("state") or "",
        }
    return None


async def main():
    print("VIRTUAL HILL MODE", flush=True)
    print("Waiting for MikeAircraft CURRENT within 8 km of Hostivice hill...", flush=True)

    client = BleakClient(DEVICE, timeout=20)
    sequence = 0x6200
    locked = None
    previous = None
    previous_time = None
    lock_started = None

    async def send(tilt, pan):
        nonlocal sequence
        seq = sequence
        sequence += 1
        await client.write_gatt_char(TX, packet(seq, tilt, pan), response=False)

    async def stop_motion():
        if client.is_connected:
            for _ in range(5):
                try:
                    await send(0, 0)
                except Exception:
                    pass
                await asyncio.sleep(0.05)

    try:
        await asyncio.wait_for(client.connect(), 25)
        print("RS 4 Bluetooth connected.", flush=True)
        await stop_motion()

        while True:
            try:
                data = await asyncio.to_thread(fetch_engine)
                target = current_target(data)
            except Exception:
                await stop_motion()
                print("Waiting for live MikeAircraft data...", flush=True)
                await asyncio.sleep(1.0)
                continue

            if locked is None:
                if not target or target["distance"] > LOCK_RANGE_KM:
                    await stop_motion()
                    if target:
                        print(f"Waiting: {target['callsign']} {target['distance']:.1f} km from virtual hill", flush=True)
                    else:
                        print("Waiting: no suitable CURRENT aircraft", flush=True)
                    await asyncio.sleep(1.0)
                    continue

                locked = target["id"]
                previous = target
                previous_time = time.monotonic()
                lock_started = previous_time
                print(
                    f"LOCKED {target['callsign']}  {target['state']}  {target['distance']:.1f} km  "
                    f"bearing {target['bearing']:.1f} deg  elevation {target['elevation']:.1f} deg",
                    flush=True,
                )
                print("Gimbal's present position is the starting reference for this simulation.", flush=True)
                await stop_motion()
                await asyncio.sleep(SAMPLE_SECONDS)
                continue

            if not target or target["id"] != locked or target["distance"] > DROP_RANGE_KM:
                await stop_motion()
                print("Target left tracking window or CURRENT changed. Test finished.", flush=True)
                break

            now = time.monotonic()
            dt = max(0.2, now - previous_time)
            pan_rate = angle_delta(target["bearing"], previous["bearing"]) / dt
            tilt_rate = (target["elevation"] - previous["elevation"]) / dt

            pan_cmd = clamp_command(pan_rate * PAN_RATE_SCALE)
            tilt_cmd = clamp_command(tilt_rate * TILT_RATE_SCALE)

            print(
                f"{target['callsign']}  {target['distance']:.2f} km  "
                f"bearing {target['bearing']:.1f}  elev {target['elevation']:.1f}  "
                f"pan {pan_cmd:+d} tilt {tilt_cmd:+d}",
                flush=True,
            )

            deadline = time.monotonic() + SAMPLE_SECONDS
            while time.monotonic() < deadline:
                await send(tilt_cmd, pan_cmd)
                await asyncio.sleep(0.05)

            previous = target
            previous_time = now

            if now - lock_started >= MAX_TRACK_SECONDS:
                await stop_motion()
                print("45-second virtual tracking test complete.", flush=True)
                break

    except KeyboardInterrupt:
        print("Stopped by user.", flush=True)
    except Exception as error:
        print("TRACKER:", type(error).__name__, str(error), flush=True)
    finally:
        try:
            await stop_motion()
        except Exception:
            pass
        if client.is_connected:
            try:
                await asyncio.wait_for(client.disconnect(), 3)
            except Exception:
                pass
        print("Finished.", flush=True)


if __name__ == "__main__":
    asyncio.run(main())
