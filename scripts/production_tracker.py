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
from dataclasses import dataclass
from datetime import datetime, timezone
import hashlib
import json
import math
import os
from pathlib import Path
import struct
import time
import traceback
import urllib.request

from production_tracking import AircraftObservation, CameraReference, ControllerV1, GeometryTargetSource, wrap180
from camera_optics import angular_tolerance_deg, camera_optics, normalized_frame_offset


CAMERA_REFERENCE_URL = "https://mikeaircraft.vercel.app/api/camera-reference"
CAMERA_OPTICS_URL = "https://mikeaircraft.vercel.app/api/settings"
DIRECT_TRACKER_URL = "https://mikeaircraft.vercel.app/api/direct-tracker"
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


def load_camera_optics(url):
    payload = read_json_url(url)
    value = (payload.get("settings") or {}).get("cameraOptics") or {}
    return camera_optics(value.get("slider_position_0_1", 0.0),
                         value.get("stabilisation_mode", "STANDARD_OR_OFF"),
                         value.get("timestamp_ms", utc_ms()))


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


def direct_selection(url, pin):
    """Read only the explicit Direct Tracker command; never consult ribbon state."""
    payload = read_json_url(url, {"User-Agent": "MikeAircraft-Production-Tracker",
                                  "X-MikeAircraft-Control-Pin": pin})
    if payload.get("command") != "TRACKING":
        return None
    identifier = clean_hex(payload.get("aircraftId"))
    if len(identifier) != 6 or any(character not in "0123456789abcdef" for character in identifier):
        return None
    return {"aircraft_id": identifier,
            "callsign": str(payload.get("callsign") or identifier).strip(),
            "status": "DIRECT"}


@dataclass(frozen=True)
class AdsbIntakeResult:
    observation: object
    diagnostics: dict
    duplicate: bool


def observation_from_adsb(aircraft, aircraft_id, source_snapshot_s, local_read_ms):
    """Build one observation using dump1090's epoch-seconds source clock."""
    lat, lon = aircraft.get("lat"), aircraft.get("lon")
    if not isinstance(lat, (int, float)) or not isinstance(lon, (int, float)):
        raise ValueError("position latitude/longitude missing or non-numeric")
    seen_pos = aircraft.get("seen_pos")
    if not isinstance(source_snapshot_s, (int, float)) or not math.isfinite(source_snapshot_s):
        raise ValueError("dump1090 snapshot now missing, non-numeric, or non-finite")
    if not isinstance(seen_pos, (int, float)) or not math.isfinite(seen_pos) or seen_pos < 0:
        raise ValueError("dump1090 seen_pos missing, negative, non-numeric, or non-finite")
    timestamp_ms = round((float(source_snapshot_s) - float(seen_pos)) * 1000)
    if timestamp_ms > local_read_ms + 2000:
        raise ValueError("derived source observation time is materially in the future")
    geometric_altitude = aircraft.get("alt_geom")
    if (not isinstance(geometric_altitude, (int, float))
            or isinstance(geometric_altitude, bool)
            or not math.isfinite(geometric_altitude)):
        geometric_altitude = None
    legacy_pressure_altitude = aircraft.get("altitude")
    if (not isinstance(legacy_pressure_altitude, (int, float))
            or isinstance(legacy_pressure_altitude, bool)
            or not math.isfinite(legacy_pressure_altitude)):
        legacy_pressure_altitude = None
    if geometric_altitude is not None:
        altitude_source = "ADS_B_GEOMETRIC"
        legacy_pressure_altitude = None
    elif legacy_pressure_altitude is not None:
        altitude_source = "DUMP1090_LEGACY_PRESSURE_ALTITUDE_APPROXIMATE"
    else:
        altitude_source = "UNAVAILABLE"
    vertical_rate = aircraft.get("geom_rate")
    vertical_rate_source = "ADS_B_GEOMETRIC_RATE"
    if (not isinstance(vertical_rate, (int, float))
            or isinstance(vertical_rate, bool) or not math.isfinite(vertical_rate)):
        vertical_rate = aircraft.get("vert_rate")
        vertical_rate_source = "DUMP1090_LEGACY_BAROMETRIC_RATE"
    if (not isinstance(vertical_rate, (int, float))
            or isinstance(vertical_rate, bool) or not math.isfinite(vertical_rate)):
        vertical_rate = None
        vertical_rate_source = "UNAVAILABLE"
    ground_speed = aircraft.get("gs")
    track = aircraft.get("track")
    return AircraftObservation(aircraft_id, timestamp_ms, float(lat), float(lon),
                               None if geometric_altitude is None else float(geometric_altitude) * 0.3048,
                               float(ground_speed) if isinstance(ground_speed, (int, float)) else None,
                               float(track) if isinstance(track, (int, float)) else None,
                               float(vertical_rate) if vertical_rate is not None else None,
                               altitude_source=altitude_source,
                               altitude_barometric_m=(None if legacy_pressure_altitude is None
                                                       else float(legacy_pressure_altitude) * 0.3048),
                               vertical_rate_source=vertical_rate_source)


class AdsbObservationIntake:
    """Validate, identify, and de-duplicate source position updates."""

    def __init__(self):
        self.aircraft_id = None
        self.last_snapshot_ms = None
        self.last_observation_ms = None
        self.last_update_identity = None

    def select_aircraft(self, aircraft_id):
        if aircraft_id != self.aircraft_id:
            self.aircraft_id = aircraft_id
            self.last_snapshot_ms = None
            self.last_observation_ms = None
            self.last_update_identity = None

    @staticmethod
    def _identity(observation):
        payload = [observation.aircraft_id, observation.timestamp_ms,
                   observation.latitude_deg, observation.longitude_deg,
                   observation.altitude_ellipsoid_m, observation.ground_speed_kt,
                   observation.track_deg, observation.vertical_rate_ft_min,
                   observation.altitude_barometric_m, observation.altitude_source,
                   observation.vertical_rate_source]
        encoded = json.dumps(payload, separators=(",", ":"), allow_nan=False).encode("utf-8")
        return hashlib.sha256(encoded).hexdigest()[:20]

    def ingest(self, feed, aircraft, aircraft_id, local_read_ms):
        self.select_aircraft(aircraft_id)
        snapshot_s = feed.get("now")
        base = {
            "aircraft_id": aircraft_id,
            "snapshot_now": snapshot_s,
            "seen_pos": aircraft.get("seen_pos"),
            "source_snapshot_timestamp_ms": None,
            "source_observation_timestamp_ms": None,
            "local_read_timestamp_ms": local_read_ms,
            "source_age_ms": None,
            "source_update_identity": None,
            "latitude_deg": aircraft.get("lat"),
            "longitude_deg": aircraft.get("lon"),
            "altitude_ellipsoid_m": None,
            "altitude_barometric_m": None,
            "altitude_source": "UNAVAILABLE",
            "ground_speed_kt": aircraft.get("gs"),
            "track_deg": aircraft.get("track"),
            "vertical_rate_ft_min": None,
            "vertical_rate_source": "UNAVAILABLE",
            "duplicate": False,
            "estimator_accepted": False,
        }
        try:
            observation = observation_from_adsb(aircraft, aircraft_id, snapshot_s, local_read_ms)
            snapshot_ms = round(float(snapshot_s) * 1000)
            base.update(source_snapshot_timestamp_ms=snapshot_ms,
                        source_observation_timestamp_ms=observation.timestamp_ms,
                        source_age_ms=local_read_ms - observation.timestamp_ms,
                        altitude_ellipsoid_m=observation.altitude_ellipsoid_m,
                        altitude_barometric_m=observation.altitude_barometric_m,
                        altitude_source=observation.altitude_source,
                        vertical_rate_ft_min=observation.vertical_rate_ft_min,
                        vertical_rate_source=observation.vertical_rate_source)
            if self.last_snapshot_ms is not None and snapshot_ms < self.last_snapshot_ms - 1000:
                raise ValueError("dump1090 snapshot clock jumped backward")
            identity = self._identity(observation)
            base["source_update_identity"] = identity
            if identity == self.last_update_identity:
                base.update(duplicate=True, timing_status="DUPLICATE")
                self.last_snapshot_ms = max(self.last_snapshot_ms or snapshot_ms, snapshot_ms)
                return AdsbIntakeResult(None, base, True)
            if (self.last_observation_ms is not None
                    and observation.timestamp_ms <= self.last_observation_ms):
                raise ValueError("source observation time did not advance for changed payload")
            self.last_snapshot_ms = snapshot_ms
            self.last_observation_ms = observation.timestamp_ms
            self.last_update_identity = identity
            base["timing_status"] = "NEW"
            return AdsbIntakeResult(observation, base, False)
        except (TypeError, ValueError, OverflowError) as error:
            base.update(timing_status="INVALID", timing_error=str(error))
            return AdsbIntakeResult(None, base, False)


def configured_effective_latency_s(value=None):
    raw = value if value is not None else os.environ.get("MIKEAIRCRAFT_EFFECTIVE_LATENCY_S", "0.25")
    latency = float(raw)
    if not math.isfinite(latency) or latency < 0.0 or latency > 2.0:
        raise ValueError("effective latency must be between 0.0 and 2.0 seconds")
    return latency


class Diagnostics:
    def __init__(self, path):
        self.handle = Path(path).open("a", encoding="utf-8", buffering=1)

    def write(self, target, output, telemetry, bluetooth_state, optics):
        row = target.as_dict()
        optics_fields = optics.as_dict()
        frame_x = normalized_frame_offset(output.yaw_error_deg, optics.horizontal_fov_deg)
        frame_y = normalized_frame_offset(output.pitch_error_deg, optics.vertical_fov_deg)
        acquire_yaw = angular_tolerance_deg(0.25, optics.horizontal_fov_deg)
        acquire_pitch = angular_tolerance_deg(0.25, optics.vertical_fov_deg)
        track_yaw = angular_tolerance_deg(0.10, optics.horizontal_fov_deg)
        track_pitch = angular_tolerance_deg(0.10, optics.vertical_fov_deg)
        invalid_optics_diagnostics = [name for name, value in (
            ("frame_x", frame_x), ("frame_y", frame_y),
            ("acquire_yaw_tolerance", acquire_yaw),
            ("acquire_pitch_tolerance", acquire_pitch),
            ("track_yaw_tolerance", track_yaw),
            ("track_pitch_tolerance", track_pitch),
        ) if value is None]
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
            "pitch_acquire_diagnostic": getattr(output, "pitch_acquire_diagnostic", None),
            "bluetooth_state": bluetooth_state,
            "camera_optics": optics_fields,
            "slider_position": optics.slider_position_0_1,
            "equivalent_focal_length_mm": optics.equivalent_focal_length_mm,
            "horizontal_fov_deg": optics.horizontal_fov_deg,
            "vertical_fov_deg": optics.vertical_fov_deg,
            "stabilisation_mode": optics.stabilisation_mode,
            "optics_source": optics.source,
            "optics_source_confidence": optics.source_confidence,
            "optics_diagnostics_valid": not invalid_optics_diagnostics,
            "optics_diagnostics_error": (None if not invalid_optics_diagnostics else
                                           "invalid: " + ", ".join(invalid_optics_diagnostics)),
            "predicted_controller_residual_frame_x_n_not_observed": frame_x,
            "predicted_controller_residual_frame_y_n_not_observed": frame_y,
            "acquire_yaw_tolerance_deg": acquire_yaw,
            "acquire_pitch_tolerance_deg": acquire_pitch,
            "track_yaw_tolerance_deg": track_yaw,
            "track_pitch_tolerance_deg": track_pitch,
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
    try:
        optics = await asyncio.to_thread(load_camera_optics, args.camera_optics_url)
    except Exception:
        # Optics is diagnostic-only; a settings outage must never prevent tracking.
        optics = camera_optics(0.0, "STANDARD_OR_OFF", utc_ms())
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
    adsb_intake = AdsbObservationIntake()
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
                if args.direct:
                    selection, feed = await asyncio.gather(
                        asyncio.to_thread(direct_selection, args.direct_tracker_url, args.pin),
                        asyncio.to_thread(local.read_local_feed))
                else:
                    engine, feed = await asyncio.gather(
                        asyncio.to_thread(ble.fetch_engine), asyncio.to_thread(local.read_local_feed))
                    selection = current_selection(engine)
                new_id = selection and selection["aircraft_id"]
                if new_id != selected_id:
                    selected_id = new_id
                    source.select_aircraft(new_id)
                    adsb_intake.select_aircraft(new_id)
                    controller.reset_target(new_id) if new_id else None
                if selected_id:
                    aircraft = next((item for item in feed.get("aircraft") or []
                                     if clean_hex(item.get("hex")) == selected_id), None)
                    local_read_ms = utc_ms()
                    result = adsb_intake.ingest(feed, aircraft or {}, selected_id, local_read_ms)
                    accepted = bool(result.observation and source.update(result.observation))
                    result.diagnostics["estimator_accepted"] = accepted
                    diagnostics.event("adsb_source_observation", **result.diagnostics)
            except Exception as error:
                diagnostics.event("adsb_poll_failure", exception_type=type(error).__name__,
                                  exception=str(error))
            await asyncio.sleep(max(0.0, ADS_B_POLL_S - (time.monotonic() - requested_at)))

    async def poll_optics():
        nonlocal optics
        while True:
            try:
                optics = await asyncio.to_thread(load_camera_optics, args.camera_optics_url)
            except Exception as error:
                diagnostics.event("camera_optics_poll_failure", exception_type=type(error).__name__,
                                  exception=str(error))
            await asyncio.sleep(2.0)

    try:
        await connect()
        responder = asyncio.create_task(service_protocol_requests())
        poller = asyncio.create_task(poll_aircraft())
        optics_poller = asyncio.create_task(poll_optics())
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
            }, bluetooth_state, optics)
            await asyncio.sleep(max(0.0, CONTROL_PERIOD_S - (time.monotonic() - tick)))
    finally:
        # Cleanup is deliberately best-effort and may never replace the first fault.
        if 'poller' in locals():
            poller.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await poller
        if 'optics_poller' in locals():
            optics_poller.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await optics_poller
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
    parser.add_argument("--camera-optics-url", default=CAMERA_OPTICS_URL)
    parser.add_argument("--direct", action="store_true", help="use only the explicit Direct Tracker ICAO command")
    parser.add_argument("--direct-tracker-url", default=DIRECT_TRACKER_URL)
    parser.add_argument("--effective-latency", type=configured_effective_latency_s,
                        default=configured_effective_latency_s(),
                        help="downstream aim latency in seconds (persistent env: MIKEAIRCRAFT_EFFECTIVE_LATENCY_S)")
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
