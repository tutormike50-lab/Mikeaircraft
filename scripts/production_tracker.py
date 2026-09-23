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
import urllib.request

from production_tracking import AircraftObservation, CameraReference, ControllerV1, GeometryTargetSource, wrap180


CAMERA_REFERENCE_URL = "https://mikeaircraft.vercel.app/api/camera-reference"
CONTROL_PERIOD_S = 0.05
ADS_B_POLL_S = 0.20
TELEMETRY_MAX_AGE_S = 2.0
RS4_YAW_SIGN = 1
RS4_PITCH_SIGN = 1


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

    def receive(_, data):
        nonlocal measured_yaw, measured_pitch, telemetry_at
        raw = bytes(data)
        if len(raw) < 19 or raw[0] != 0x55 or raw[9:11] != bytes((4, 5)):
            return
        try:
            pitch_raw, _, yaw_raw = struct.unpack_from("<hhh", raw[11:-2], 0)
        except struct.error:
            return
        measured_pitch, measured_yaw = pitch_raw / 10.0, yaw_raw / 10.0
        telemetry_at = time.monotonic()

    async def send_axes(tilt, pan):
        nonlocal sequence
        sequence = (sequence + 1) & 0xFFFF
        await client.write_gatt_char(tx_char, ble.packet(sequence, tilt, pan), response=False)

    async def stop_motion():
        if client is None or not client.is_connected or tx_char is None:
            return
        for _ in range(5):
            with contextlib.suppress(Exception):
                await send_axes(0, 0)
            await asyncio.sleep(0.04)

    async def connect():
        nonlocal client, tx_char, home_yaw, home_pitch, bluetooth_state
        bluetooth_state = "CONNECTING"
        client = BleakClient(ble.DEVICE, timeout=20)
        await asyncio.wait_for(client.connect(), 25)
        tx_char = client.services.get_characteristic(ble.TX)
        if tx_char is None:
            raise RuntimeError("RS4 TX characteristic not found")
        await asyncio.wait_for(client.start_notify(ble.RX, receive), 6)
        deadline = time.monotonic() + 5
        while measured_yaw is None and time.monotonic() < deadline:
            await asyncio.sleep(0.05)
        if measured_yaw is None:
            raise RuntimeError("RS4 telemetry unavailable")
        home_yaw, home_pitch = measured_yaw, measured_pitch
        controller.estimated_yaw_deg = controller.estimated_pitch_deg = 0.0
        bluetooth_state = "CONNECTED"
        await stop_motion()

    try:
        await connect()
        next_adsb = 0.0
        last_tick = time.monotonic()
        while True:
            tick = time.monotonic()
            now_ms = utc_ms()
            if client is None or not client.is_connected:
                bluetooth_state = "RECONNECTING"
                await stop_motion()
                raise RuntimeError("Bluetooth disconnected; STOP required before a new run")
            if tick >= next_adsb:
                next_adsb = tick + ADS_B_POLL_S
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
                    observation = observation_from_adsb(aircraft or {}, selected_id, now_ms)
                    if observation:
                        source.update(observation)
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
            }, bluetooth_state)
            await asyncio.sleep(max(0.0, CONTROL_PERIOD_S - (time.monotonic() - tick)))
    finally:
        await stop_motion()
        if client is not None:
            with contextlib.suppress(Exception):
                await client.disconnect()
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
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
