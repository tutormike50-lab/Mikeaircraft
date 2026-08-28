#!/usr/bin/env python3
import asyncio
import struct
import sys
from bleak import BleakClient

TX = "0000fff5-0000-1000-8000-00805f9b34fb"
RX = "0000fff4-0000-1000-8000-00805f9b34fb"
DEVICE = "0C:9A:E6:FC:8E:73"


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
    # Proven RS 4 BLE virtual-stick layout:
    # first channel = tilt, second = neutral/roll, third = pan
    data += struct.pack("<hhh", 1024 + tilt, 1024, 1024 + pan)
    data += bytes.fromhex("00 00 02")
    return data + struct.pack("<H", crc(data))


def movement_for(direction, strength):
    moves = {
        "left":       (0, -strength),
        "right":      (0, strength),
        "up":         (strength, 0),
        "down":       (-strength, 0),
        "up-right":   (strength, strength),
        "upright":    (strength, strength),
        "up-left":    (strength, -strength),
        "upleft":     (strength, -strength),
        "down-right": (-strength, strength),
        "downright":  (-strength, strength),
        "down-left":  (-strength, -strength),
        "downleft":   (-strength, -strength),
        "stop":       (0, 0),
        "centre":     (0, 0),
        "center":     (0, 0),
    }
    if direction not in moves:
        raise ValueError("direction must be left/right/up/down/up-right/up-left/down-right/down-left/stop")
    return moves[direction]


async def main():
    direction = (sys.argv[1] if len(sys.argv) > 1 else "stop").lower()
    try:
        strength = int(sys.argv[2]) if len(sys.argv) > 2 else 192
    except ValueError:
        raise SystemExit("strength must be a number")
    try:
        duration = float(sys.argv[3]) if len(sys.argv) > 3 else 1.0
    except ValueError:
        raise SystemExit("duration must be a number")

    strength = max(0, min(abs(strength), 512))
    duration = max(0.05, min(duration, 3.0))
    tilt, pan = movement_for(direction, strength)

    buffer = bytearray()
    answers = {}
    sent = {}
    sequence = 0x5200
    moving = False
    client = BleakClient(DEVICE, timeout=20)

    def receive(sender, data):
        buffer.extend(data)
        while len(buffer) >= 4:
            size = int.from_bytes(buffer[1:3], "little") & 1023
            if buffer[0] != 0x55 or not 13 <= size <= 1023:
                del buffer[0]
                continue
            if len(buffer) < size:
                return
            p = bytes(buffer[:size])
            if crc(p[:-2]) != int.from_bytes(p[-2:], "little"):
                del buffer[0]
                continue
            del buffer[:size]
            if p[4:6] == bytes([4, 2]) and p[8] & 128 and p[9:11] == bytes([4, 1]):
                answers[int.from_bytes(p[6:8], "little")] = p[11:-2].hex()

    async def send(tilt_value, pan_value, label):
        nonlocal sequence
        seq = sequence
        sequence += 1
        sent[seq] = label
        await asyncio.wait_for(
            client.write_gatt_char(TX, packet(seq, tilt_value, pan_value), response=False),
            0.5,
        )
        return seq

    try:
        print("Connecting...", flush=True)
        await asyncio.wait_for(client.connect(), 25)
        await asyncio.wait_for(client.start_notify(RX, receive), 5)
        if client.services.get_characteristic(TX).max_write_without_response_size < 22:
            raise RuntimeError("Message limit too small; movement not sent.")

        check_seq = await send(0, 0, "CHECK")
        await asyncio.sleep(0.8)
        if answers.get(check_seq) != "00":
            raise RuntimeError("Neutral reply missing or different; movement not sent.")

        print(f"Moving {direction}: strength={strength}, duration={duration:.2f}s", flush=True)
        moving = direction not in ("stop", "centre", "center")
        deadline = asyncio.get_running_loop().time() + duration
        while asyncio.get_running_loop().time() < deadline:
            await send(tilt, pan, "MOVE")
            await asyncio.sleep(0.05)

    except Exception as error:
        print("TEST:", type(error).__name__, str(error), flush=True)
    finally:
        if client.is_connected:
            try:
                for _ in range(5):
                    await send(0, 0, "STOP")
                    await asyncio.sleep(0.05)
                await asyncio.sleep(0.5)
                stop_ok = any(sent.get(s) == "STOP" and v == "00" for s, v in answers.items())
                print("STOP confirmed." if stop_ok else "STOP sent; acknowledgement not confirmed.", flush=True)
            except Exception:
                print("STOP delivery warning: switch gimbal off if it is still moving.", flush=True)
            try:
                await asyncio.wait_for(client.disconnect(), 3)
            except Exception:
                print("Bluetooth disconnect cleanup warning.", flush=True)

    print("Finished.", flush=True)


if __name__ == "__main__":
    asyncio.run(main())
