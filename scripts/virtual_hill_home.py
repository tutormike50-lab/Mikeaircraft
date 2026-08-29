#!/usr/bin/env python3
import asyncio
import struct
import time

from bleak import BleakClient

import virtual_hill_tracker as base
import virtual_hill_local as tracker

RECENT_SECONDS = 120
WAIT_SECONDS = 1.5
HOME_TOLERANCE_DEG = 2.0
HOME_TIMEOUT_SECONDS = 15.0


def filtered_choice(engine, recent):
    now = time.monotonic()
    expired = [hx for hx, until in recent.items() if until <= now]
    for hx in expired:
        recent.pop(hx, None)

    data = dict(engine)
    aircraft = []
    for ac in engine.get("aircraft") or []:
        hx = tracker.clean_hex(ac.get("hex"))
        if hx and hx in recent:
            continue
        aircraft.append(ac)
    data["aircraft"] = aircraft

    intelligence = dict(engine.get("intelligence") or {})
    current = dict(intelligence.get("current") or {})
    if tracker.clean_hex(current.get("hex")) in recent:
        intelligence["current"] = None
    data["intelligence"] = intelligence

    return tracker.choose_from_engine(data)


def home_error(target_yaw, current_yaw):
    return (target_yaw - current_yaw + 180.0) % 360.0 - 180.0


def home_pan_command(error):
    magnitude = abs(error)
    if magnitude <= HOME_TOLERANCE_DEG:
        return 0
    if magnitude > 25:
        speed = 180
    elif magnitude > 10:
        speed = 120
    else:
        speed = 70
    return speed if error > 0 else -speed


async def main():
    print("VIRTUAL HILL - CONTINUOUS TRACKING + TOWER HOME", flush=True)
    print("Point the camera at the tower before starting. Startup position becomes HOME.", flush=True)

    client = None
    tx_char = None
    sequence = 0x7C00
    recent = {}
    latest_yaw = None
    latest_pitch = None
    home_yaw = None
    home_pitch = None

    def receive(sender, data):
        nonlocal latest_yaw, latest_pitch
        b = bytes(data)
        if len(b) < 19 or b[0] != 0x55:
            return
        if b[9] != 0x04 or b[10] != 0x05:
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

                print(f"RS 4 Bluetooth connected and held open (attempt {attempt}).", flush=True)
                return
            except Exception as error:
                last_error = error
                await disconnect_ble()
                if attempt < 5:
                    print(f"Bluetooth connection retry {attempt}/5...", flush=True)
                    await asyncio.sleep(3)

        raise RuntimeError(f"Could not establish RS 4 Bluetooth link: {last_error}")

    async def send(tilt, pan):
        nonlocal sequence
        if client is None or not client.is_connected or tx_char is None:
            raise EOFError("RS 4 Bluetooth link unavailable")
        seq = sequence
        sequence += 1
        await client.write_gatt_char(tx_char, base.packet(seq, tilt, pan), response=False)

    async def stop_motion():
        if client is None or not client.is_connected or tx_char is None:
            return
        for _ in range(5):
            try:
                await send(0, 0)
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
        nonlocal home_yaw, home_pitch
        deadline = time.monotonic() + 4.0
        while (latest_yaw is None or latest_pitch is None) and time.monotonic() < deadline:
            await asyncio.sleep(0.05)
        if latest_yaw is None or latest_pitch is None:
            raise RuntimeError("Could not read RS 4 position telemetry for HOME")
        home_yaw = latest_yaw
        home_pitch = latest_pitch
        print(
            f"TOWER HOME CAPTURED  yaw {home_yaw:+.1f} deg  pitch {home_pitch:+.1f} deg",
            flush=True,
        )

    async def return_home():
        await ensure_ble()
        if home_yaw is None:
            return

        print("Returning to TOWER HOME...", flush=True)
        start = time.monotonic()
        while time.monotonic() - start < HOME_TIMEOUT_SECONDS:
            if latest_yaw is None:
                await stop_motion()
                await asyncio.sleep(0.1)
                continue

            error = home_error(home_yaw, latest_yaw)
            if abs(error) <= HOME_TOLERANCE_DEG:
                await stop_motion()
                print(
                    f"TOWER HOME REACHED  yaw {latest_yaw:+.1f} deg  error {error:+.1f} deg",
                    flush=True,
                )
                return

            pan = home_pan_command(error)
            print(
                f"HOME RETURN  yaw {latest_yaw:+.1f}  error {error:+.1f}  pan {pan:+d}",
                flush=True,
            )

            burst_end = time.monotonic() + 0.18
            while time.monotonic() < burst_end:
                try:
                    await send(0, pan)
                except Exception:
                    await stop_motion()
                    await ensure_ble()
                    break
                await asyncio.sleep(0.05)
            await stop_motion()
            await asyncio.sleep(0.08)

        await stop_motion()
        print("HOME RETURN TIMEOUT - stopped safely.", flush=True)

    async def wait_for_selection():
        while True:
            await ensure_ble()
            try:
                engine = await asyncio.to_thread(base.fetch_engine)
                selection = filtered_choice(engine, recent)
            except Exception:
                selection = None

            if selection:
                print(
                    f"SELECTED {selection['callsign']}  {selection['state']}  "
                    f"{selection['distance']:.1f} km from virtual hill",
                    flush=True,
                )
                print("Local Pi ADS-B now drives this target.", flush=True)
                return selection

            await stop_motion()
            print("At TOWER HOME - waiting for the next active aircraft...", flush=True)
            await asyncio.sleep(WAIT_SECONDS)

    async def track_one(selection):
        locked = False
        previous = None
        previous_time = None
        lock_started = None
        last_local_seen = None

        while True:
            await ensure_ble()

            try:
                target = await asyncio.to_thread(tracker.local_target, selection)
            except Exception:
                target = None

            now = time.monotonic()

            if target is None:
                await stop_motion()
                if last_local_seen is None:
                    print(f"Waiting for {selection['callsign']} in local ADS-B feed...", flush=True)
                elif now - last_local_seen > tracker.LOCAL_STALE_SECONDS:
                    print("Local ADS-B target lost. Moving on.", flush=True)
                    return
                await asyncio.sleep(0.35)
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

                locked = True
                previous = target
                previous_time = now
                lock_started = now
                print(
                    f"LOCKED {target['callsign']}  {selection['state']}  {target['distance']:.1f} km  "
                    f"bearing {target['bearing']:.1f} deg  elevation {target['elevation']:.1f} deg  [LOCAL_PI]",
                    flush=True,
                )
                print("Tracking on the persistent RS 4 Bluetooth connection.", flush=True)
                await stop_motion()
                await asyncio.sleep(tracker.LOCAL_SAMPLE_SECONDS)
                continue

            if target["distance"] > base.DROP_RANGE_KM:
                await stop_motion()
                print("Target left the tracking window.", flush=True)
                return

            try:
                feed = await asyncio.to_thread(tracker.read_local_feed)
                ground = False
                for ac in feed.get("aircraft") or []:
                    if tracker.clean_hex(ac.get("hex")) == selection["hex"]:
                        ground = ac.get("alt_baro") == "ground"
                        break
                if ground:
                    await stop_motion()
                    print("Target is on the ground.", flush=True)
                    return
            except Exception:
                pass

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

            deadline = time.monotonic() + tracker.LOCAL_SAMPLE_SECONDS
            while time.monotonic() < deadline:
                try:
                    await send(tilt_cmd, pan_cmd)
                except Exception:
                    await stop_motion()
                    await ensure_ble()
                    break
                await asyncio.sleep(0.05)

            previous = target
            previous_time = now

            if now - lock_started >= base.MAX_TRACK_SECONDS:
                await stop_motion()
                print("45-second tracking window complete.", flush=True)
                return

    try:
        await connect_ble()
        await stop_motion()
        await capture_home()

        while True:
            selection = await wait_for_selection()
            await track_one(selection)
            await stop_motion()

            hx = tracker.clean_hex(selection.get("hex"))
            if hx:
                recent[hx] = time.monotonic() + RECENT_SECONDS

            await return_home()
            print("At TOWER HOME. Looking for the next aircraft...", flush=True)
            await asyncio.sleep(1.0)

    except KeyboardInterrupt:
        print("Stopped by user.", flush=True)
    except Exception as error:
        print("HOME TRACKER:", type(error).__name__, str(error), flush=True)
    finally:
        try:
            await stop_motion()
        except Exception:
            pass
        await disconnect_ble()
        print("Finished.", flush=True)


if __name__ == "__main__":
    asyncio.run(main())
