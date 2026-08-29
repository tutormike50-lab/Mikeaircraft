#!/usr/bin/env python3
import asyncio
import struct
import time
from bleak import BleakClient

import virtual_hill_tracker as base

MOVE_OFFSET_DEG = 10.0
TOLERANCE_DEG = 0.20
TIMEOUT_SECONDS = 20.0


def wrap180(v):
    return (v + 180.0) % 360.0 - 180.0


def angle_error(target, current):
    return wrap180(target - current)


def command_for_error(error):
    m = abs(error)
    if m <= TOLERANCE_DEG:
        return 0
    if m > 20:
        speed = 110
    elif m > 8:
        speed = 75
    elif m > 3:
        speed = 45
    elif m > 1:
        speed = 28
    else:
        speed = 16
    return speed if error > 0 else -speed


async def main():
    print("HORNBACH HOME REPEATABILITY TEST - PAN ONLY", flush=True)
    print("Start with Hornbach horizontally centred. Camera will move about 10 deg right, then return.", flush=True)
    print("Ctrl+C stops immediately.", flush=True)

    client = BleakClient(base.DEVICE, timeout=20)
    tx_char = None
    sequence = 0xD100
    latest_yaw = None
    latest_pitch = None

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

    async def send_pan(pan):
        nonlocal sequence
        sequence += 1
        await client.write_gatt_char(tx_char, base.packet(sequence, 0, pan), response=False)

    async def stop_motion():
        if tx_char is None or not client.is_connected:
            return
        for _ in range(5):
            try:
                await send_pan(0)
            except Exception:
                return
            await asyncio.sleep(0.05)

    async def move_to(target_yaw, label):
        started = time.monotonic()
        while time.monotonic() - started < TIMEOUT_SECONDS:
            if latest_yaw is None:
                await asyncio.sleep(0.05)
                continue
            err = angle_error(target_yaw, latest_yaw)
            if abs(err) <= TOLERANCE_DEG:
                await stop_motion()
                print(f"{label} REACHED yaw {latest_yaw:+.1f} error {err:+.1f}", flush=True)
                return True
            pan = command_for_error(err)
            print(f"{label} yaw {latest_yaw:+.1f}->{target_yaw:+.1f} error {err:+.1f} pan {pan:+d}", flush=True)
            burst_end = time.monotonic() + (0.14 if abs(err) > 2 else 0.08)
            while time.monotonic() < burst_end:
                await send_pan(pan)
                await asyncio.sleep(0.04)
            await stop_motion()
            await asyncio.sleep(0.10)
        await stop_motion()
        print(f"{label} TIMEOUT at yaw {latest_yaw:+.1f}", flush=True)
        return False

    try:
        await asyncio.wait_for(client.connect(), 25)
        await asyncio.sleep(0.8)
        await asyncio.wait_for(client.start_notify(base.RX, receive), 6)
        tx_char = client.services.get_characteristic(base.TX)
        if tx_char is None:
            raise RuntimeError("RS 4 TX characteristic not found")

        deadline = time.monotonic() + 4.0
        while latest_yaw is None and time.monotonic() < deadline:
            await asyncio.sleep(0.05)
        if latest_yaw is None:
            raise RuntimeError("No RS 4 yaw telemetry")

        await stop_motion()
        home_yaw = latest_yaw
        home_pitch = latest_pitch
        print(f"HORNBACH HOME CAPTURED yaw {home_yaw:+.1f} pitch {home_pitch:+.1f}", flush=True)

        away_yaw = wrap180(home_yaw + MOVE_OFFSET_DEG)
        if not await move_to(away_yaw, "AWAY"):
            return
        await asyncio.sleep(0.5)

        print("RETURNING TO CAPTURED HORNBACH HOME...", flush=True)
        await move_to(home_yaw, "HOME")
        print(f"FINAL yaw {latest_yaw:+.1f} pitch {latest_pitch:+.1f}", flush=True)

    except KeyboardInterrupt:
        print("Stopped by user.", flush=True)
    except Exception as exc:
        print("HOME REPEATABILITY TEST:", type(exc).__name__, str(exc), flush=True)
    finally:
        try:
            await stop_motion()
        except Exception:
            pass
        try:
            if client.is_connected:
                await asyncio.wait_for(client.disconnect(), 4)
        except Exception:
            pass
        print("Finished.", flush=True)


if __name__ == "__main__":
    asyncio.run(main())
