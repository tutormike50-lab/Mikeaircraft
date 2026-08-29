#!/usr/bin/env python3
import asyncio
import struct
import time
from bleak import BleakClient

DEVICE = "0C:9A:E6:FC:8E:73"
RX = "0000fff4-0000-1000-8000-00805f9b34fb"

samples = []

def receive(sender, data):
    b = bytes(data)
    # DJI DUML frame: cmd set/id at bytes 9/10, payload starts at 11.
    if len(b) < 19 or b[0] != 0x55:
        return
    if b[9] != 0x04 or b[10] != 0x05:
        return
    payload = b[11:-2]
    if len(payload) < 6:
        return
    try:
        pitch_raw, roll_raw, yaw_raw = struct.unpack_from("<hhh", payload, 0)
    except struct.error:
        return
    pitch = pitch_raw / 10.0
    roll = roll_raw / 10.0
    yaw = yaw_raw / 10.0
    samples.append((pitch, roll, yaw))
    if len(samples) <= 12 or len(samples) % 10 == 0:
        print(f"HOME TELEMETRY  pitch {pitch:+.1f} deg  roll {roll:+.1f} deg  yaw {yaw:+.1f} deg", flush=True)

async def main():
    print("RS 4 HOME POSITION PROBE - NO MOVEMENT COMMANDS WILL BE SENT", flush=True)
    client = BleakClient(DEVICE, timeout=20)
    try:
        await asyncio.wait_for(client.connect(), 25)
        await asyncio.sleep(0.8)
        await asyncio.wait_for(client.start_notify(RX, receive), 6)
        print("Connected. Reading the tower/home position for 8 seconds...", flush=True)
        await asyncio.sleep(8)
        if samples:
            recent = samples[-min(20, len(samples)):]
            p = sum(x[0] for x in recent) / len(recent)
            r = sum(x[1] for x in recent) / len(recent)
            y = sum(x[2] for x in recent) / len(recent)
            print(f"HOME CAPTURED  pitch {p:+.1f} deg  roll {r:+.1f} deg  yaw {y:+.1f} deg", flush=True)
        else:
            print("NO POSITION TELEMETRY RECEIVED", flush=True)
    except Exception as error:
        print("HOME PROBE:", type(error).__name__, str(error), flush=True)
    finally:
        try:
            if client.is_connected:
                await asyncio.wait_for(client.disconnect(), 4)
        except Exception:
            pass
        print("Finished. Gimbal was not commanded to move.", flush=True)

if __name__ == "__main__":
    asyncio.run(main())
