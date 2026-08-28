#!/usr/bin/env python3
import asyncio
import json
import os
import time
import urllib.request

import virtual_hill_tracker as base
from bleak import BleakClient

ACTIVE_STATES = {
    "APPROACHING",
    "ON_FINAL",
    "TAKEOFF_ROLL",
    "AIRBORNE_DEPARTURE",
    "DEPARTING",
}

LOCAL_JSON_PATHS = [
    "/run/dump1090-mutability/aircraft.json",
    "/var/run/dump1090-mutability/aircraft.json",
    "/run/dump1090/aircraft.json",
]
LOCAL_HTTP = "http://127.0.0.1/dump1090/data/aircraft.json"
LOCAL_SAMPLE_SECONDS = 0.35
LOCAL_STALE_SECONDS = 3.0


def clean_hex(value):
    return str(value or "").strip().lower()


def state_of(ac, current=None):
    return str(ac.get("state") or (current or {}).get("state") or "").strip().upper()


def is_active(ac, current=None):
    return state_of(ac, current) in ACTIVE_STATES


def same_aircraft(ac, target_id=None, target_hex=None):
    ac_id = ac.get("id")
    ac_hex = clean_hex(ac.get("hex"))
    return bool((target_id and ac_id == target_id) or (target_hex and ac_hex == target_hex))


def choose_from_engine(data):
    aircraft = data.get("aircraft") or []
    current = (data.get("intelligence") or {}).get("current") or {}
    current_id = current.get("id")
    current_hex = clean_hex(current.get("hex"))

    if current_id or current_hex:
        for ac in aircraft:
            if same_aircraft(ac, current_id, current_hex) and is_active(ac, current):
                target = base.make_target(ac, current, "CURRENT_ACTIVE")
                if target and clean_hex(ac.get("hex")):
                    return {
                        "id": ac.get("id") or target.get("id"),
                        "hex": clean_hex(ac.get("hex")),
                        "callsign": target.get("callsign") or clean_hex(ac.get("hex")),
                        "state": state_of(ac, current),
                        "distance": target.get("distance"),
                    }

    candidates = []
    for ac in aircraft:
        if not is_active(ac):
            continue
        hx = clean_hex(ac.get("hex"))
        if not hx:
            continue
        target = base.make_target(ac, None, "NEAREST_ACTIVE")
        if target:
            candidates.append((target, ac))

    candidates.sort(key=lambda pair: pair[0]["distance"])
    if not candidates:
        return None

    target, ac = candidates[0]
    return {
        "id": ac.get("id") or target.get("id"),
        "hex": clean_hex(ac.get("hex")),
        "callsign": target.get("callsign") or clean_hex(ac.get("hex")),
        "state": state_of(ac),
        "distance": target.get("distance"),
    }


def read_local_feed():
    for path in LOCAL_JSON_PATHS:
        try:
            if os.path.exists(path):
                with open(path, "r", encoding="utf-8") as handle:
                    data = json.load(handle)
                if isinstance(data.get("aircraft"), list):
                    return data
        except Exception:
            pass

    req = urllib.request.Request(LOCAL_HTTP, headers={"User-Agent": "MikeAircraft-Local-Gimbal"})
    with urllib.request.urlopen(req, timeout=2) as response:
        data = json.loads(response.read().decode("utf-8"))
    return data


def local_target(selection):
    data = read_local_feed()
    for ac in data.get("aircraft") or []:
        if clean_hex(ac.get("hex")) != selection["hex"]:
            continue

        local = dict(ac)
        local["id"] = selection.get("id") or selection["hex"]
        local["callsign"] = str(ac.get("flight") or selection.get("callsign") or selection["hex"]).strip()
        local["state"] = selection.get("state") or "ACTIVE"

        if local.get("altitude") is None:
            local["altitude"] = local.get("alt_baro")
        return base.make_target(local, selection, "LOCAL_PI")
    return None


async def main():
    print("VIRTUAL HILL - LOCAL ADS-B MODE", flush=True)
    print("MikeAircraft chooses the aircraft; Pi local ADS-B drives the gimbal.", flush=True)

    client = BleakClient(base.DEVICE, timeout=20)
    sequence = 0x7200
    tx_char = None
    selection = None
    locked = False
    previous = None
    previous_time = None
    lock_started = None
    last_local_seen = None

    def receive(sender, data):
        pass

    async def send(tilt, pan):
        nonlocal sequence
        seq = sequence
        sequence += 1
        if tx_char is None:
            raise RuntimeError("RS 4 TX characteristic not ready")
        await client.write_gatt_char(tx_char, base.packet(seq, tilt, pan), response=False)

    async def stop_motion():
        if client.is_connected and tx_char is not None:
            for _ in range(5):
                try:
                    await send(0, 0)
                except Exception:
                    pass
                await asyncio.sleep(0.05)

    try:
        await asyncio.wait_for(client.connect(), 25)
        await asyncio.sleep(0.5)
        await asyncio.wait_for(client.start_notify(base.RX, receive), 5)
        tx_char = client.services.get_characteristic(base.TX)
        if tx_char is None:
            raise RuntimeError("RS 4 TX characteristic not found")
        if tx_char.max_write_without_response_size < 22:
            raise RuntimeError("RS 4 Bluetooth message size is too small")
        print("RS 4 Bluetooth connected and ready.", flush=True)
        await stop_motion()

        while selection is None:
            try:
                engine = await asyncio.to_thread(base.fetch_engine)
                selection = choose_from_engine(engine)
            except Exception:
                selection = None

            if selection is None:
                print("Waiting for an active MikeAircraft target...", flush=True)
                await asyncio.sleep(1.5)
                continue

            print(
                f"SELECTED {selection['callsign']}  {selection['state']}  "
                f"{selection['distance']:.1f} km from virtual hill",
                flush=True,
            )
            print("From here, tracking positions come directly from the Pi receiver.", flush=True)

        while True:
            try:
                target = await asyncio.to_thread(local_target, selection)
            except Exception:
                target = None

            now = time.monotonic()
            if target is None:
                await stop_motion()
                if last_local_seen is None:
                    print(f"Waiting for {selection['callsign']} in local ADS-B feed...", flush=True)
                elif now - last_local_seen > LOCAL_STALE_SECONDS:
                    print("Local ADS-B target lost for more than 3 seconds. Test finished.", flush=True)
                    break
                await asyncio.sleep(0.5)
                continue

            last_local_seen = now

            if not locked:
                if target["distance"] > base.LOCK_RANGE_KM:
                    await stop_motion()
                    print(
                        f"LOCAL {target['callsign']} {target['distance']:.1f} km from virtual hill - waiting for 8.0 km",
                        flush=True,
                    )
                    await asyncio.sleep(0.5)
                    continue

                if target["distance"] > base.DROP_RANGE_KM:
                    await stop_motion()
                    print("Target outside tracking window. Test finished.", flush=True)
                    break

                locked = True
                previous = target
                previous_time = now
                lock_started = now
                print(
                    f"LOCKED {target['callsign']}  {selection['state']}  {target['distance']:.1f} km  "
                    f"bearing {target['bearing']:.1f} deg  elevation {target['elevation']:.1f} deg  [LOCAL_PI]",
                    flush=True,
                )
                print("Gimbal movement is now driven only by local ADS-B position changes.", flush=True)
                await stop_motion()
                await asyncio.sleep(LOCAL_SAMPLE_SECONDS)
                continue

            if target["distance"] > base.DROP_RANGE_KM:
                await stop_motion()
                print("Target left the 10 km tracking window. Test finished.", flush=True)
                break

            altitude_raw = None
            try:
                feed = await asyncio.to_thread(read_local_feed)
                for ac in feed.get("aircraft") or []:
                    if clean_hex(ac.get("hex")) == selection["hex"]:
                        altitude_raw = ac.get("alt_baro")
                        break
            except Exception:
                pass
            if altitude_raw == "ground":
                await stop_motion()
                print("Target is on the ground. Test finished.", flush=True)
                break

            dt = max(0.2, now - previous_time)
            pan_rate = base.angle_delta(target["bearing"], previous["bearing"]) / dt
            tilt_rate = (target["elevation"] - previous["elevation"]) / dt
            pan_cmd = base.clamp_command(pan_rate * base.PAN_RATE_SCALE)
            tilt_cmd = base.clamp_command(tilt_rate * base.TILT_RATE_SCALE)

            print(
                f"LOCAL {target['callsign']} {target['distance']:.2f} km  "
                f"bearing {target['bearing']:.1f} elev {target['elevation']:.1f}  "
                f"pan {pan_cmd:+d} tilt {tilt_cmd:+d}",
                flush=True,
            )

            deadline = time.monotonic() + LOCAL_SAMPLE_SECONDS
            while time.monotonic() < deadline:
                await send(tilt_cmd, pan_cmd)
                await asyncio.sleep(0.05)

            previous = target
            previous_time = now

            if now - lock_started >= base.MAX_TRACK_SECONDS:
                await stop_motion()
                print("45-second local virtual tracking test complete.", flush=True)
                break

    except KeyboardInterrupt:
        print("Stopped by user.", flush=True)
    except Exception as error:
        print("LOCAL TRACKER:", type(error).__name__, str(error), flush=True)
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
