#!/usr/bin/env python3
import asyncio
import struct
import time
from bleak import BleakClient

import virtual_hill_tracker as base

HOME_YAW = 3.1
TOLERANCE_DEG = 2.0
TIMEOUT_SECONDS = 12.0

latest_yaw = None


def angle_delta(target, current):
    return (target - current + 180.0) % 360.0 - 180.0


def receive(sender, data):
    global latest_yaw
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


def command_for_error(error):
    magnitude = abs(error)
    if magnitude <= TOLERANCE_DEG:
        return 0
    if magnitude > 25:
        speed = 180
    elif magnitude > 10:
        speed = 120
    else:
        speed = 70
    return speed if error > 0 else -speed


async def main():
    global latest_yaw
    print("RS 4 RETURN-TO-HOME TEST - PAN ONLY", flush=True)
    print(f"Tower HOME yaw = {HOME_YAW:+.1f} deg", flush=True)

    client = BleakClient(base.DEVICE, timeout=20)
    tx_char = None
    sequence = 0x7A00

    async def send(pan):
        nonlocal sequence
        seq = sequence
        sequence += 1
        await client.write_gatt_char(tx_char, base.packet(seq, 0, pan), response=False)

    async def stop_motion():
        if tx_char is None or not client.is_connected:
            return
        for _ in range(5):
            try:
                await send(0)
            except Exception:
                return
            await asyncio.sleep(0.05)

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

        deadline = time.monotonic() + 3.0
        while latest_yaw is None and time.monotonic() < deadline:
            await asyncio.sleep(0.05)
        if latest_yaw is None:
            raise RuntimeError("No RS 4 yaw telemetry received")

        print(f"Starting yaw {latest_yaw:+.1f} deg", flush=True)
        start = time.monotonic()

        while time.monotonic() - start < TIMEOUT_SECONDS:
            if latest_yaw is None:
                await stop_motion()
                await asyncio.sleep(0.1)
                continue

            error = angle_delta(HOME_YAW, latest_yaw)
            if abs(error) <= TOLERANCE_DEG:
                await stop_motion()
                print(f"HOME REACHED  yaw {latest_yaw:+.1f} deg  error {error:+.1f} deg", flush=True)
                return

            pan = command_for_error(error)
            print(f"yaw {latest_yaw:+.1f} deg  home error {error:+.1f} deg  pan {pan:+d}", flush=True)

            burst_end = time.monotonic() + 0.18
            while time.monotonic() < burst_end:
                await send(pan)
                await asyncio.sleep(0.05)
            await stop_motion()
            await asyncio.sleep(0.08)

        await stop_motion()
        print(f"HOME TEST TIMEOUT - stopped safely at yaw {latest_yaw:+.1f} deg", flush=True)

    except KeyboardInterrupt:
        print("Stopped by user.", flush=True)
    except Exception as error:
        print("HOME TEST:", type(error).__name__, str(error), flush=True)
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
