#!/usr/bin/env python3
"""MikeAircraft contained production tracker.

Read-only ``--check`` is the default. Hardware movement requires both ``--track``
and an exact interactive confirmation. The legacy trackers are imported only for
their already-proven BLE packet format and pitch command behaviour; they are not
modified.
"""

import argparse
import asyncio
import contextlib
from datetime import datetime, timezone
import json
import math
import os
from pathlib import Path
import struct
import time
import traceback
import urllib.request

from production_tracking import AircraftObservation, CameraReference, ControllerV1, GeometryTargetSource, wrap180


CAMERA_REFERENCE_URL = "https://mikeaircraft.vercel.app/api/camera-reference"
CONTROL_PERIOD_S = 0.05
ADS_B_POLL_S = 0.20
TELEMETRY_MAX_AGE_S = 2.0
RS4_YAW_SIGN = 1
RS4_PITCH_SIGN = 1

RS4_PROTOCOL_REQUESTS = {
    (0x04, 0x02, 0x00, 0x04, 0x38),
    (0x04, 0x02, 0x20, 0x04, 0x64),
    (0x27, 0x02, 0x40, 0x00, 0x00),
}


class BleLifecycleError(RuntimeError):
    """A BLE failure annotated with the operation that first observed it."""

    def __init__(self, stage, detail, disconnected_at=None):
        self.stage = stage
        self.disconnected_at = disconnected_at
        suffix = (f"; disconnect_monotonic_s={disconnected_at:.6f}"
                  if disconnected_at is not None else "")
        super().__init__(f"BLE stage={stage}: {detail}{suffix}")


def dji_crc(data):
    value = 0x3692
    for byte in data:
        value ^= byte
        for _ in range(8):
            value = (value >> 1) ^ (0x8408 if value & 1 else 0)
    return value


class DjiFrameDecoder:
    """Reassemble complete DJI frames from arbitrarily grouped BLE notifications."""

    def __init__(self):
        self.buffer = bytearray()

    def feed(self, data):
        self.buffer.extend(data)
        frames = []
        while len(self.buffer) >= 3:
            if self.buffer[0] != 0x55:
                del self.buffer[0]
                continue
            size = self.buffer[1] | ((self.buffer[2] & 0x03) << 8)
            if not 13 <= size <= 1023:
                del self.buffer[0]
                continue
            if len(self.buffer) < size:
                break
            frame = bytes(self.buffer[:size])
            if dji_crc(frame[:-2]) != int.from_bytes(frame[-2:], "little"):
                del self.buffer[0]
                continue
            del self.buffer[:size]
            frames.append(frame)
        return frames


def rs4_protocol_response(frame):
    """Return the response proven by the official Ronin app capture, if required."""
    if len(frame) < 13:
        return None
    request = (frame[4], frame[5], frame[8], frame[9], frame[10])
    if request not in RS4_PROTOCOL_REQUESTS:
        return None
    response = bytes((0x55, 0x0D, 0x04, 0x33, frame[5], frame[4]))
    response += frame[6:8] + bytes((0x80, frame[9], frame[10]))
    return response + struct.pack("<H", dji_crc(response))


def client_connected(client):
    """Read Bleak connection state without allowing cleanup checks to mask a fault."""
    if client is None:
        return False
    try:
        return bool(client.is_connected)
    except Exception:
        return False


def effective_write_hz(count, first_write_at, sample_at):
    """Return completed write intervals per second, without inflating short samples."""
    if count < 2 or first_write_at is None or sample_at is None or sample_at <= first_write_at:
        return 0.0
    return (count - 1) / (sample_at - first_write_at)


def make_disconnect_callback(get_client, is_intentional, on_disconnect):
    """Build a callback that only faults the active, unexpectedly lost client."""
    def callback(disconnected_client):
        if disconnected_client is get_client() and not is_intentional():
            on_disconnect(disconnected_client, time.monotonic())
    return callback


async def prepare_rs4_gatt(client, ble, receive, sleep=asyncio.sleep):
    """Finish the proven RS4 service-discovery/notification handshake."""
    await sleep(0.8)
    await asyncio.wait_for(client.start_notify(ble.RX, receive), 6)
    tx_char = client.services.get_characteristic(ble.TX)
    if tx_char is None:
        raise RuntimeError("RS4 TX characteristic not found")
    size = 0
    for _ in range(20):
        try:
            size = int(tx_char.max_write_without_response_size)
        except Exception:
            size = 0
        if size >= 22:
            return tx_char
        await sleep(0.4)
    raise RuntimeError("RS4 Bluetooth message size is too small")


def utc_ms():
    return int(time.time() * 1000)


def read_json_url(url, headers=None, timeout=6):
    request = urllib.request.Request(url, headers=headers or {"User-Agent": "MikeAircraft-Production-Tracker"})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def load_camera_reference(url, pin):
    payload = read_json_url(url, {"User-Agent": "MikeAircraft-Production-Tracker",
                                  "X-MikeAircraft-Control-Pin": pin})
    if not payload.get("ok"):
        raise RuntimeError(payload.get("error") or "CameraReference unavailable")
    return CameraReference.from_api(payload.get("cameraReference") or {})


def clean_hex(value):
    return str(value or "").strip().lower()


def current_selection(engine):
    current = (engine.get("intelligence") or {}).get("current") or {}
    identifier = clean_hex(current.get("hex") or current.get("id"))
    if not identifier:
        return None
    return {"aircraft_id": identifier,
            "callsign": str(current.get("callsign") or identifier).strip(),
            "status": str(current.get("state") or "CURRENT").strip().upper()}


def observation_from_adsb(aircraft, aircraft_id, received_ms):
    lat, lon = aircraft.get("lat"), aircraft.get("lon")
    if not isinstance(lat, (int, float)) or not isinstance(lon, (int, float)):
        return None
    seen_pos = aircraft.get("seen_pos")
    timestamp_ms = received_ms - round(float(seen_pos or 0) * 1000)
    altitude = aircraft.get("alt_geom")
    altitude_source = "ADS_B_GEOMETRIC"
    if not isinstance(altitude, (int, float)):
        altitude = None
        altitude_source = "UNAVAILABLE_BAROMETRIC_NOT_SUBSTITUTED"
    vertical_rate = aircraft.get("geom_rate")
    if not isinstance(vertical_rate, (int, float)):
        vertical_rate = None
    ground_speed = aircraft.get("gs")
    track = aircraft.get("track")
    return AircraftObservation(aircraft_id, timestamp_ms, float(lat), float(lon),
                               None if altitude is None else float(altitude) * 0.3048,
                               float(ground_speed) if isinstance(ground_speed, (int, float)) else None,
                               float(track) if isinstance(track, (int, float)) else None,
                               float(vertical_rate) if vertical_rate is not None else None,
                               altitude_source=altitude_source)


class Diagnostics:
    def __init__(self, path):
        self.handle = Path(path).open("a", encoding="utf-8", buffering=1)

    def write(self, target, output, telemetry, bluetooth_state):
        row = target.as_dict()
        row.update({
            "monotonic_s": time.monotonic(),
            "estimated_rs4_yaw_deg": telemetry.get("estimated_yaw"),
            "estimated_rs4_pitch_deg": telemetry.get("estimated_pitch"),
            "measured_rs4_yaw_deg": telemetry.get("measured_yaw"),
            "measured_rs4_pitch_deg": telemetry.get("measured_pitch"),
            "rs4_telemetry_age_ms": telemetry.get("age_ms"),
            "last_successful_write_monotonic_s": telemetry.get("last_successful_write_monotonic_s"),
            "successful_ble_write_count": telemetry.get("successful_write_count"),
            "effective_ble_write_hz": telemetry.get("effective_write_hz"),
            "last_ble_command": telemetry.get("last_command"),
            "yaw_error_deg": output.yaw_error_deg,
            "pitch_error_deg": output.pitch_error_deg,
            "controller_state": output.state,
            "requested_yaw_rate_deg_s": output.requested_yaw_rate_deg_s,
            "requested_pitch_rate_deg_s": output.requested_pitch_rate_deg_s,
            "final_rs4_pan_command": output.pan_command,
            "final_rs4_tilt_command": output.tilt_command,
            "bluetooth_state": bluetooth_state,
        })
        self.handle.write(json.dumps(row, sort_keys=True, separators=(",", ":")) + "\n")

    def close(self):
        self.handle.close()

    def event(self, event, **fields):
        row = {"event": event, "monotonic_s": time.monotonic(), **fields}
        self.handle.write(json.dumps(row, sort_keys=True, separators=(",", ":")) + "\n")


async def run(args):
    # Imported only after explicit movement confirmation, so --check cannot touch BLE.
    from bleak import BleakClient
    import virtual_hill_local as local
    import virtual_hill_tracker as ble

    camera = await asyncio.to_thread(load_camera_reference, args.camera_reference_url, args.pin)
    source = GeometryTargetSource(camera, effective_latency_s=args.effective_latency)
    controller = ControllerV1()
    client = None
    tx_char = None
    sequence = 0xE100
    measured_yaw = measured_pitch = None
    home_yaw = home_pitch = None
    telemetry_at = None
    selected_id = None
    bluetooth_state = "DISCONNECTED"
    diagnostics = Diagnostics(args.log)
    intentional_disconnect = False
    disconnected_at = None
    disconnect_state = None
    connected_at = None
    first_write_at = None
    last_write_at = None
    write_count = 0
    last_command = None
    frame_decoder = DjiFrameDecoder()
    protocol_responses = asyncio.Queue()
    protocol_response_count = 0
    write_lock = asyncio.Lock()

    def record_disconnect(disconnected_client, occurred_at):
        nonlocal bluetooth_state, disconnected_at, disconnect_state
        disconnected_at = occurred_at
        disconnect_state = "unexpected"
        bluetooth_state = "FAULT_DISCONNECTED"
        with contextlib.suppress(Exception):
            diagnostics.event("ble_disconnect", state=disconnect_state,
                              client_is_connected=client_connected(disconnected_client),
                              connected_elapsed_s=(occurred_at - connected_at
                                                   if connected_at is not None else None),
                              last_successful_write_monotonic_s=last_write_at,
                              last_write_age_s=(occurred_at - last_write_at
                                                if last_write_at is not None else None),
                              successful_write_count=write_count,
                              effective_write_hz=effective_write_hz(
                                  write_count, first_write_at, occurred_at),
                              protocol_response_count=protocol_response_count,
                              last_command=last_command)

    disconnected = make_disconnect_callback(
        lambda: client, lambda: intentional_disconnect, record_disconnect)

    def receive(_, data):
        nonlocal measured_yaw, measured_pitch, telemetry_at
        for frame in frame_decoder.feed(data):
            response = rs4_protocol_response(frame)
            if response is not None:
                protocol_responses.put_nowait(response)
            if len(frame) < 19 or frame[9:11] != bytes((4, 5)):
                continue
            try:
                pitch_raw, _, yaw_raw = struct.unpack_from("<hhh", frame, 11)
            except struct.error:
                continue
            measured_pitch, measured_yaw = pitch_raw / 10.0, yaw_raw / 10.0
            telemetry_at = time.monotonic()

    async def service_protocol_requests():
        nonlocal protocol_response_count
        while True:
            response = await protocol_responses.get()
            try:
                async with write_lock:
                    await asyncio.wait_for(
                        client.write_gatt_char(tx_char, response, response=False), 2.0)
                protocol_response_count += 1
            except Exception as error:
                raise BleLifecycleError(
                    "protocol_response_write", f"{type(error).__name__}: {error}",
                    disconnected_at) from error

    async def send_axes(tilt, pan):
        nonlocal sequence, bluetooth_state, disconnected_at, disconnect_state
        nonlocal first_write_at, last_write_at, write_count, last_command
        if disconnected_at is not None or not client_connected(client):
            if disconnected_at is None:
                disconnected_at = time.monotonic()
                disconnect_state = "observed_before_write"
                bluetooth_state = "FAULT_DISCONNECTED"
                diagnostics.event("ble_disconnect_observed", state=disconnect_state)
            raise BleLifecycleError("command_write_precheck", "client is not connected", disconnected_at)
        sequence = (sequence + 1) & 0xFFFF
        try:
            async with write_lock:
                await asyncio.wait_for(
                    client.write_gatt_char(
                        tx_char, ble.packet(sequence, tilt, pan), response=False), 2.0)
            written_at = time.monotonic()
            if first_write_at is None:
                first_write_at = written_at
            last_write_at = written_at
            write_count += 1
            last_command = {"tilt": tilt, "pan": pan, "sequence": sequence}
        except Exception as error:
            if disconnected_at is None:
                disconnected_at = time.monotonic()
                disconnect_state = "write_failed"
                bluetooth_state = "FAULT_WRITE"
                diagnostics.event("ble_write_failure", state=disconnect_state,
                                  exception_type=type(error).__name__, exception=str(error))
            raise BleLifecycleError("command_write", f"{type(error).__name__}: {error}",
                                    disconnected_at) from error

    async def stop_motion():
        # Once a disconnect/write failure is observed, do not touch the dead client.
        if disconnected_at is not None or not client_connected(client) or tx_char is None:
            return
        for _ in range(5):
            with contextlib.suppress(Exception):
                await send_axes(0, 0)
            await asyncio.sleep(0.04)

    async def connect():
        nonlocal client, tx_char, home_yaw, home_pitch, bluetooth_state, connected_at
        bluetooth_state = "CONNECTING"
        client = BleakClient(ble.DEVICE, timeout=20, disconnected_callback=disconnected)
        await asyncio.wait_for(client.connect(), 25)
        tx_char = await prepare_rs4_gatt(client, ble, receive)
        deadline = time.monotonic() + 5
        while measured_yaw is None and time.monotonic() < deadline:
            await asyncio.sleep(0.05)
        if measured_yaw is None:
            raise RuntimeError("RS4 telemetry unavailable")
        home_yaw, home_pitch = measured_yaw, measured_pitch
        controller.estimated_yaw_deg = controller.estimated_pitch_deg = 0.0
        bluetooth_state = "CONNECTED"
        connected_at = time.monotonic()
        await stop_motion()

    async def poll_aircraft():
        """Keep network latency out of the proven 20 Hz RS4 write cadence."""
        nonlocal selected_id
        while True:
            requested_at = time.monotonic()
            try:
                engine, feed = await asyncio.gather(
                    asyncio.to_thread(ble.fetch_engine), asyncio.to_thread(local.read_local_feed))
                selection = current_selection(engine)
                new_id = selection and selection["aircraft_id"]
                if new_id != selected_id:
                    selected_id = new_id
                    source.estimator.clear()
                    controller.reset_target(new_id) if new_id else None
                if selected_id:
                    aircraft = next((item for item in feed.get("aircraft") or []
                                     if clean_hex(item.get("hex")) == selected_id), None)
                    observation = observation_from_adsb(aircraft or {}, selected_id, utc_ms())
                    if observation:
                        source.update(observation)
            except Exception as error:
                diagnostics.event("adsb_poll_failure", exception_type=type(error).__name__,
                                  exception=str(error))
            await asyncio.sleep(max(0.0, ADS_B_POLL_S - (time.monotonic() - requested_at)))

    try:
        await connect()
        responder = asyncio.create_task(service_protocol_requests())
        poller = asyncio.create_task(poll_aircraft())
        last_tick = time.monotonic()
        while True:
            tick = time.monotonic()
            now_ms = utc_ms()
            if disconnected_at is not None or not client_connected(client):
                if disconnected_at is None:
                    disconnected_at = tick
                    disconnect_state = "observed_by_control_loop"
                    diagnostics.event(
                        "ble_disconnect_observed", state=disconnect_state,
                        client_is_connected=False,
                        connected_elapsed_s=(tick - connected_at
                                             if connected_at is not None else None),
                        last_successful_write_monotonic_s=last_write_at,
                        last_write_age_s=(tick - last_write_at
                                          if last_write_at is not None else None),
                        successful_write_count=write_count,
                        effective_write_hz=effective_write_hz(
                            write_count, first_write_at, tick),
                        protocol_response_count=protocol_response_count,
                        last_command=last_command)
                bluetooth_state = "FAULT_DISCONNECTED"
                raise BleLifecycleError("control_loop_precheck", "unexpected disconnect",
                                        disconnected_at)
            if poller.done():
                poller.result()
            if responder.done():
                responder.result()
            target = source.latest(now_ms)
            if telemetry_at is None or tick - telemetry_at > TELEMETRY_MAX_AGE_S:
                await stop_motion()
                raise RuntimeError("RS4 telemetry stale; tracking stopped")
            relative_yaw = wrap180(measured_yaw - home_yaw)
            relative_pitch = -wrap180(measured_pitch - home_pitch)
            controller.correct_telemetry(relative_yaw, relative_pitch)
            output = controller.step(target, tick - last_tick)
            last_tick = tick
            await send_axes(output.tilt_command * RS4_PITCH_SIGN,
                            output.pan_command * RS4_YAW_SIGN)
            diagnostics.write(target, output, {
                "estimated_yaw": controller.estimated_yaw_deg,
                "estimated_pitch": controller.estimated_pitch_deg,
                "measured_yaw": relative_yaw, "measured_pitch": relative_pitch,
                "age_ms": round((tick - telemetry_at) * 1000),
                "last_successful_write_monotonic_s": last_write_at,
                "successful_write_count": write_count,
                "effective_write_hz": effective_write_hz(
                    write_count, first_write_at, last_write_at),
                "last_command": last_command,
            }, bluetooth_state)
            await asyncio.sleep(max(0.0, CONTROL_PERIOD_S - (time.monotonic() - tick)))
    finally:
        # Cleanup is deliberately best-effort and may never replace the first fault.
        if 'poller' in locals():
            poller.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await poller
        if 'responder' in locals():
            responder.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await responder
        with contextlib.suppress(Exception):
            await stop_motion()
        if client is not None:
            intentional_disconnect = True
            with contextlib.suppress(Exception):
                if client_connected(client):
                    await asyncio.wait_for(client.disconnect(), 4)
        with contextlib.suppress(Exception):
            diagnostics.close()


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="validate configuration without network or hardware")
    parser.add_argument("--track", action="store_true", help="enable the production hardware loop")
    parser.add_argument("--camera-reference-url", default=CAMERA_REFERENCE_URL)
    parser.add_argument("--effective-latency", type=float, default=0.25)
    parser.add_argument("--log", default=f"production-tracker-{datetime.now(timezone.utc):%Y%m%dT%H%M%SZ}.jsonl")
    parser.add_argument("--pin", default=os.environ.get("MIKEAIRCRAFT_CONTROL_PIN", ""))
    args = parser.parse_args(argv)
    if not args.track:
        print("PRODUCTION TRACKER CHECK OK: 20 Hz GeometryTarget -> Controller V1; no network/BLE opened.")
        print(f"Actuator signs yaw={RS4_YAW_SIGN:+d} pitch={RS4_PITCH_SIGN:+d}; yaw scale=0.063 deg/s/command.")
        return 0
    if not args.pin:
        parser.error("--track requires MIKEAIRCRAFT_CONTROL_PIN or --pin")
    confirmation = input("Type TRACK CURRENT to permit RS4 movement: ").strip()
    if confirmation != "TRACK CURRENT":
        print("Cancelled; no Bluetooth connection opened.")
        return 2
    try:
        asyncio.run(run(args))
        return 0
    except KeyboardInterrupt:
        print("STOP requested.")
        return 130
    except Exception as error:
        print(f"PRODUCTION TRACKER FAULT: {type(error).__name__}: {error}")
        traceback.print_exception(type(error), error, error.__traceback__)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
