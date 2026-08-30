#!/usr/bin/env python3
"""MikeAircraft: joystick tracker v1, independent data polling / immutable HOME.

Default/--check is read-only: no Bluetooth, aircraft requests, or file writes.
--track-one --radar-centred explicitly enables the existing one-aircraft test.
Do NOT start it unless the radar's top centre is centred in the live image.
Original Pi scripts are not edited. Speed tables, filtering and geometry are
reused. Reconnects NEVER rebase HOME or resume tracking. The run is aborted;
a recovery connection can send ONLY neutral STOP packets. Re-centre the radar
visually before a new run. No absolute orientation sensor is available to
prove the coordinate frame survived a gap. Do not substitute old yaw values.

Software cannot stop motors over a broken radio link. STOP delivery is attempted
on recovery, not guaranteed. Keep the gimbal's physical stop/power accessible.
--check does not open Bluetooth. Live runs write a timestamped text log next to
this script. A fresh interactive CENTRED confirmation is required each run.

This is ONE-POINT INITIAL ALIGNMENT, not a validated full lens/axis calibration.
It assumes the existing level-axis model and the configured camera altitude.
The LCD alignment was approximate; no image feedback or zoom model is added.
An independent landmark/aircraft check remains necessary before routine use.

Reference: Czech AIP LKPR AD 2.10, radar on building, remark TWR:
50 06 22.3 N, 014 16 01.3 E, obstacle elevation 412 m AMSL.
https://aim.rlp.cz/eaip/html/eAIP/LK-AD-2.LKPR-en-GB.html#LKPR-AD-2.10
412 m is the radar obstacle top, NOT the centre of the glazed control room.
Camera: existing Pi configuration (50.0652778 N, 14.3041667 E, 360 m).
The existing flat-Earth elevation formula is deliberately retained consistently
for both aircraft and reference. Curvature/refraction and altitude-datum errors
are not resolved by this first trial. Camera height has not been resurveyed.

Observed radar pose was yaw about -2.8, pitch +179.7, roll 0.0 degrees.
These observations are NOT stored as motor targets: fresh HOME telemetry is
captured at each explicitly confirmed start and NEVER modified within a run.

Pi file hashes were matched to Screenshot (301). virtual_hill_local.py is the
older 344ce4a7 version, intentionally retained rather than upgraded.
"""

import argparse
import ast
import asyncio
import builtins
import hashlib
import importlib
import math
from pathlib import Path
import sys
import struct
import time
import contextlib
import getpass
import warnings
from datetime import datetime, timezone
from control_panel_trim import PanelTrim, framed_targets

TELEMETRY_MAX_AGE = 1.5
COMMAND_MAX_AGE = 1.5
WRITE_TIMEOUT = 0.5
HOME_SAMPLE_WINDOW = 3.0
HOME_CAPTURE_TIMEOUT = 6.0
TARGET_LOOKUP_MAX_AGE = 4.0  # same four-second target-loss window; not ADS-B age


class SafetyStop(RuntimeError):
    """A latched fault: no further movement or automatic HOME is allowed."""


class SessionGuard:
    def __init__(self, clock=time.monotonic):
        self.clock = clock
        self.home = None
        self.telemetry_at = None
        self.last_command_at = clock()
        self.moving = False
        self.reason = None

    def trip(self, reason):
        if self.reason is None:
            self.reason = reason
            print(f"SAFETY LATCH: {reason}. HOME NOT REBASED; automatic return disabled.", flush=True)

    def require(self, connected=True):
        if not connected:
            self.trip("Bluetooth connection lost; angle reference is unverified")
        if self.telemetry_at is None or self.clock() - self.telemetry_at > TELEMETRY_MAX_AGE:
            self.trip("gimbal telemetry missing or stale")
        if self.reason:
            raise SafetyStop(self.reason)

    def capture(self, yaw, pitch):
        self.require()
        if self.home is not None:
            self.trip("attempt to replace an already captured HOME")
            raise SafetyStop(self.reason)
        self.home = (yaw, pitch)

    def check_home(self, yaw, pitch):
        self.require()
        if self.home != (yaw, pitch):
            self.trip("HOME invariant violated")
            raise SafetyStop(self.reason)

    def command_sent(self, tilt, pan):
        self.moving = bool(tilt or pan)
        self.last_command_at = self.clock()

    def check_watchdog(self, connected):
        self.require(connected)
        if self.moving and self.clock() - self.last_command_at > COMMAND_MAX_AGE:
            self.trip("control loop delayed while a movement command was active")
            raise SafetyStop(self.reason)

TOWER_LAT = 50 + 6 / 60 + 22.3 / 3600
TOWER_LON = 14 + 16 / 60 + 1.3 / 3600
TOWER_TOP_AMSL_M = 412.0

EXPECTED_SHA256 = {
    "home_arrival_right_acquire_center_lead_test.py": "2c5bb44aa8d0dc1dc23df2245d3eff8fd444b23228a7d9af66a74642e7a89d1f",
    "home_real_position_pan_tilt_stable_hybrid_test.py": "1f4cd880f4d8cf8b177267ec9548e7e422ea94750b1b550eec569034248cb7f3",
    "home_real_position_pan_tilt_resilient_test.py": "3d35c865a258252b14f09e175a701a4a220f9d16031afc63f72abaa514a29a38",
    "home_real_position_pan_tilt_test.py": "5a5c601b4a34dae19e42ed6ea62f61abb1b44b3ea54b4dd89824ada71d6acff0",
    "virtual_hill_tracker.py": "1ac9a4170483e99d81f256d21959d2c01876632fbce680fbb721ce495d8e6933",
    "virtual_hill_local.py": "723ec166838634588b62c11367dab58097678f0249afb7b1e4e64a8b8f04de60",
}


def wrap180(value):
    return (value + 180.0) % 360.0 - 180.0


def verify_sources(directory):
    sources = {}
    for name, expected in EXPECTED_SHA256.items():
        raw = (directory / name).read_bytes()
        if hashlib.sha256(raw).hexdigest() != expected:
            raise RuntimeError(f"File differs from the reviewed Pi copy: {name}. No tracking started.")
        sources[name] = raw.decode("utf-8")
    return sources


def literal_settings(source, names):
    result = {}
    for node in ast.parse(source).body:
        if isinstance(node, ast.Assign):
            for target in node.targets:
                if isinstance(target, ast.Name) and target.id in names:
                    result[target.id] = float(ast.literal_eval(node.value))
    if set(result) != set(names) or not all(math.isfinite(v) for v in result.values()):
        raise RuntimeError("Required geometry settings are missing or invalid.")
    return result


def calculate_alignment(sources):
    geometry = literal_settings(sources["home_real_position_pan_tilt_test.py"], {
        "CAMERA_LAT", "CAMERA_LON", "CAMERA_ALT_M", "REFERENCE_BEARING_DEG",
    })
    gate = literal_settings(sources["home_arrival_right_acquire_center_lead_test.py"], {
        "RIGHT_MIN_DEG", "RIGHT_MAX_DEG",
    })
    p1 = math.radians(geometry["CAMERA_LAT"])
    p2 = math.radians(TOWER_LAT)
    dl = math.radians(TOWER_LON - geometry["CAMERA_LON"])
    a = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    distance_km = 6371.0 * 2 * math.asin(math.sqrt(a))
    bearing = math.degrees(math.atan2(
        math.sin(dl) * math.cos(p2),
        math.cos(p1) * math.sin(p2) - math.sin(p1) * math.cos(p2) * math.cos(dl),
    )) % 360.0
    elevation = math.degrees(math.atan2(TOWER_TOP_AMSL_M - geometry["CAMERA_ALT_M"], distance_km * 1000))
    gate_start = (geometry["REFERENCE_BEARING_DEG"] + gate["RIGHT_MIN_DEG"]) % 360
    gate_end = (geometry["REFERENCE_BEARING_DEG"] + gate["RIGHT_MAX_DEG"]) % 360
    right_min = wrap180(gate_start - bearing)
    right_max = wrap180(gate_end - bearing)
    if not (0 <= right_min < right_max < 150):
        raise RuntimeError("Preserved acquisition sector does not fit this tower reference.")
    return dict(geometry, bearing=bearing, elevation=elevation, distance_km=distance_km,
                gate_start=gate_start, gate_end=gate_end, right_min=right_min, right_max=right_max)


def load_controller(directory):
    sys.path.insert(0, str(directory))
    lead = importlib.import_module("home_arrival_right_acquire_center_lead_test")
    for filename in EXPECTED_SHA256:
        module = sys.modules.get(filename[:-3])
        if module is None or Path(module.__file__).resolve() != (directory / filename).resolve():
            raise RuntimeError(f"Unexpected module location for {filename}.")
    return lead


def apply_reference(lead, reference):
    # Configuration only: no replacement of the motion, BLE or HOME functions.
    lead.stable.geom.REFERENCE_BEARING_DEG = reference["bearing"]
    lead.stable.geom.HOME_REFERENCE_ELEV_DEG = reference["elevation"]
    # Preserve the ORIGINAL world-bearing acquisition sector, not +5..+30
    # relative to the new landmark (which would change where aircraft lock).
    lead.RIGHT_MIN_DEG = reference["right_min"]
    lead.RIGHT_MAX_DEG = reference["right_max"]


async def guarded_main(stable, panel=None):
    print("TOWER JOYSTICK V1 - INDEPENDENT DATA POLLING + IMMUTABLE HOME", flush=True)
    print("A radio/telemetry fault ends the run. Reconnection is STOP-ONLY, never automatic HOME.", flush=True)
    print("Ctrl+C requests STOP. Radio failure can prevent STOP delivery; keep physical stop accessible.", flush=True)

    client = None
    tx_char = None
    sequence = 0xD100
    latest_yaw = None
    latest_pitch = None
    home_yaw = None
    home_pitch = None
    guard = SessionGuard(clock=time.monotonic)
    write_lock = asyncio.Lock()
    recovery_lock = asyncio.Lock()
    watcher = None
    poller = None
    intentional_disconnect = False
    recovery_attempted = False
    result = 1
    panel_mode = 'WAITING'
    panel_target = ''
    panel_ready = False
    samples = []
    last_motion_write_at = None
    max_motion_write_gap = 0.0
    last_telemetry_gap = 0.0
    max_telemetry_gap = 0.0

    def disconnected(disconnected_client):
        if disconnected_client is client and not intentional_disconnect:
            guard.trip("Bluetooth disconnect callback; angle reference is unverified")

    def receive(sender, data):
        nonlocal latest_yaw, latest_pitch, last_telemetry_gap, max_telemetry_gap
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
        received_at = time.monotonic()
        if guard.telemetry_at is not None:
            last_telemetry_gap = received_at - guard.telemetry_at
            max_telemetry_gap = max(max_telemetry_gap, last_telemetry_gap)
        guard.telemetry_at = received_at
        samples.append((guard.telemetry_at, latest_yaw, latest_pitch))
        del samples[:-20]

    async def disconnect_ble():
        nonlocal client, tx_char, intentional_disconnect
        intentional_disconnect = True
        tx_char = None
        if client is not None:
            try:
                if client.is_connected:
                    await asyncio.wait_for(client.disconnect(), 4)
            except Exception:
                pass
        client = None

    async def connect_ble():
        # Only an initial connection is permitted here. No HOME rewriting.
        nonlocal client, tx_char
        if guard.home is not None or client is not None or guard.reason:
            guard.trip("attempt to reconnect a tracking session")
            raise SafetyStop(guard.reason)
        client = stable.BleakClient(stable.geom.base.DEVICE, timeout=20,
                                   disconnected_callback=disconnected)
        await asyncio.wait_for(client.connect(), 25)
        tx_char = client.services.get_characteristic(stable.geom.base.TX)
        if tx_char is None:
            raise RuntimeError("RS 4 TX characteristic not found")
        # Neutralise any previous command before waiting for notifications.
        if not await stop_motion():
            raise SafetyStop("initial STOP writes failed")
        await asyncio.wait_for(client.start_notify(stable.geom.base.RX, receive), 6)
        deadline = time.monotonic() + 4.0
        while (latest_yaw is None or latest_pitch is None) and time.monotonic() < deadline:
            if guard.reason:
                raise SafetyStop(guard.reason)
            await asyncio.sleep(0.05)
        guard.require(client.is_connected)
        print("RS 4 connected; initial neutral writes completed.", flush=True)

    async def ensure_ble():
        if panel is not None:
            panel.require()
        guard.require(client is not None and client.is_connected and tx_char is not None)
        if guard.home is not None:
            guard.check_home(home_yaw, home_pitch)

    async def send(tilt, pan):
        nonlocal sequence, last_motion_write_at, max_motion_write_gap
        async with write_lock:
            await ensure_ble()
            sequence = (sequence + 1) & 0xFFFF
            try:
                await asyncio.wait_for(client.write_gatt_char(
                    tx_char, stable.geom.base.packet(sequence, tilt, pan), response=False), WRITE_TIMEOUT)
            except Exception as exc:
                guard.trip(f"Bluetooth command write failed: {type(exc).__name__}")
                raise SafetyStop(guard.reason) from exc
            guard.command_sent(tilt, pan)
            sent_at = time.monotonic()
            if last_motion_write_at is not None:
                max_motion_write_gap = max(max_motion_write_gap, sent_at - last_motion_write_at)
            last_motion_write_at = sent_at if tilt or pan else None

    async def stop_motion():
        # Bypasses the fault latch ONLY for neutral writes. Never reconnects.
        nonlocal sequence, last_motion_write_at
        last_motion_write_at = None
        if client is None or tx_char is None or not client.is_connected:
            return False
        success = False
        for _ in range(5):
            try:
                async with write_lock:
                    sequence = (sequence + 1) & 0xFFFF
                    await asyncio.wait_for(client.write_gatt_char(
                        tx_char, stable.geom.base.packet(sequence, 0, 0), response=False), WRITE_TIMEOUT)
                    guard.command_sent(0, 0)
                    success = True
            except Exception:
                guard.trip("neutral STOP write failed")
                break
            await asyncio.sleep(0.04)
        return success and client.is_connected

    async def emergency_stop():
        nonlocal recovery_attempted, sequence
        async with recovery_lock:
            if await stop_motion():
                print("Neutral STOP writes completed; physical framing is NOT verified.", flush=True)
                return
            guard.trip("STOP could not be delivered on the original connection")
            if recovery_attempted:
                return
            recovery_attempted = True
            await disconnect_ble()
            recovery = None
            try:
                print("STOP-ONLY reconnect attempt. Tracking and automatic HOME remain disabled.", flush=True)
                recovery = stable.BleakClient(stable.geom.base.DEVICE, timeout=4)
                await asyncio.wait_for(recovery.connect(), 4)
                stop_tx = recovery.services.get_characteristic(stable.geom.base.TX)
                if stop_tx is None:
                    raise RuntimeError("No STOP characteristic")
                for _ in range(5):
                    sequence = (sequence + 1) & 0xFFFF
                    await asyncio.wait_for(recovery.write_gatt_char(
                        stop_tx, stable.geom.base.packet(sequence, 0, 0), response=False), WRITE_TIMEOUT)
                    await asyncio.sleep(0.04)
                print("Recovery neutral writes completed. No movement commands sent; HOME unchanged.", flush=True)
            except Exception as exc:
                print(f"STOP DELIVERY FAILED ({type(exc).__name__}). USE THE GIMBAL'S PHYSICAL STOP/POWER.", flush=True)
            finally:
                if recovery is not None:
                    with contextlib.suppress(Exception):
                        await asyncio.wait_for(recovery.disconnect(), 2)

    async def watchdog():
        while True:
            await asyncio.sleep(0.05)
            try:
                if panel is not None:
                    panel.update(panel_mode, panel_target, panel_ready,
                        time.monotonic() - guard.telemetry_at if guard.telemetry_at is not None else 999,
                        time.monotonic() - guard.last_command_at)
                    try:
                        panel.require()
                    except Exception as exc:
                        guard.trip(str(exc))
                guard.check_watchdog(client is not None and client.is_connected)
            except SafetyStop:
                await emergency_stop()
                return

    async def fresh_pose_after(after):
        # STOP first, then require a new sensor sample, not a cached old pose.
        deadline = time.monotonic() + TELEMETRY_MAX_AGE + 0.1
        while True:
            await ensure_ble()
            if guard.telemetry_at > after:
                return
            if time.monotonic() >= deadline:
                guard.trip("no fresh gimbal pose after STOP")
                raise SafetyStop(guard.reason)
            await asyncio.sleep(0.02)

    async def fine_burst(pan, tilt):
        # Short, deliberate burst followed by a full stop and settle/re-read.
        end = time.monotonic() + 0.10
        while time.monotonic() < end:
            await send(tilt, pan)
            await asyncio.sleep(0.05)
        await stop_motion()
        stopped_at = time.monotonic()
        await asyncio.sleep(0.14)
        await fresh_pose_after(stopped_at)

    async def return_home():
        await ensure_ble()
        print("RETURNING TO ORIGINAL TOWER RADAR HOME (continuous session only)...", flush=True)
        started = time.monotonic()

        # Stage 1: smooth coarse return.
        while time.monotonic() - started < stable.HOME_TIMEOUT_SECONDS:
            await ensure_ble()
            if latest_yaw is None or latest_pitch is None:
                await asyncio.sleep(stable.CONTROL_SECONDS)
                continue

            ye = stable.angle_error(home_yaw, latest_yaw)
            pe = stable.angle_error(home_pitch, latest_pitch)
            if abs(ye) <= stable.HOME_COARSE_ZONE_DEG and abs(pe) <= stable.HOME_COARSE_ZONE_DEG:
                await stop_motion()
                stopped_at = time.monotonic()
                await asyncio.sleep(0.15)
                await fresh_pose_after(stopped_at)
                break

            pan = 0 if abs(ye) <= stable.HOME_COARSE_ZONE_DEG else stable.home_coarse_pan(ye)
            tilt = 0 if abs(pe) <= stable.HOME_COARSE_ZONE_DEG else stable.home_coarse_tilt(pe)
            await send(tilt, pan)
            await asyncio.sleep(stable.CONTROL_SECONDS)

        # Stage 2: proven settle/recheck behaviour for the final small error.
        for _ in range(30):
            await ensure_ble()
            if latest_yaw is None or latest_pitch is None:
                await asyncio.sleep(0.10)
                continue
            ye = stable.angle_error(home_yaw, latest_yaw)
            pe = stable.angle_error(home_pitch, latest_pitch)
            if abs(ye) <= stable.HOME_FINE_TOLERANCE_DEG and abs(pe) <= stable.HOME_FINE_TOLERANCE_DEG:
                await stop_motion()
                await fresh_pose_after(time.monotonic())
                await ensure_ble()
                ye = stable.angle_error(home_yaw, latest_yaw)
                pe = stable.angle_error(home_pitch, latest_pitch)
                if abs(ye) > stable.HOME_FINE_TOLERANCE_DEG or abs(pe) > stable.HOME_FINE_TOLERANCE_DEG:
                    continue
                print(
                    f"TOWER RADAR HOME ANGLES REACHED yaw {latest_yaw:+.1f} pitch {latest_pitch:+.1f} "
                    f"error yaw {ye:+.1f} pitch {pe:+.1f}",
                    flush=True,
                )
                print("Check the radar is centred visually: telemetry alone cannot verify lens framing.", flush=True)
                return True

            pan = stable.home_fine_pan(ye)
            tilt = stable.home_fine_tilt(pe)
            print(f"HOME FINE yaw error {ye:+.2f} pitch error {pe:+.2f} pan {pan:+d} tilt {tilt:+d}", flush=True)
            await fine_burst(pan, tilt)

        await stop_motion()
        print("HOME FINE RETURN TIMEOUT - stopped safely.", flush=True)
        return False

    try:
        if panel is not None:
            # Network setup before opening Bluetooth. HTTP polling afterwards
            # is independent and cannot block the motor or telemetry loop.
            await asyncio.wait_for(asyncio.to_thread(panel.start), 4)
        await connect_ble()
        watcher = asyncio.create_task(watchdog())
        await stop_motion()
        # Capture only fresh, settled telemetry; handle +/-180 wrapping.
        deadline = time.monotonic() + HOME_CAPTURE_TIMEOUT
        while True:
            await ensure_ble()
            recent = [s for s in samples if time.monotonic() - s[0] <= HOME_SAMPLE_WINDOW]
            if len(recent) >= 3 and recent[-1][0] - recent[0][0] >= 0.2:
                if all(abs(wrap180(s[1] - recent[-1][1])) <= 0.25 and
                       abs(wrap180(s[2] - recent[-1][2])) <= 0.25 for s in recent):
                    break
            if time.monotonic() >= deadline:
                raise SafetyStop("could not capture fresh, settled HOME telemetry")
            await asyncio.sleep(0.05)
        home_yaw, home_pitch = latest_yaw, latest_pitch
        guard.capture(home_yaw, home_pitch)
        print(f"TOWER RADAR HOME CAPTURED yaw {home_yaw:+.1f} pitch {home_pitch:+.1f} - IMMUTABLE", flush=True)
        print("Waiting for ribbon CURRENT inside 12 km from camera...", flush=True)

        selection = None
        initial_target = None
        initial_target_started = None
        while selection is None:
            await ensure_ble()
            try:
                engine = await asyncio.to_thread(stable.geom.base.fetch_engine)
                candidate = await asyncio.to_thread(stable.ribbon_current, engine)
            except Exception:
                candidate = None
            await ensure_ble()

            if candidate:
                try:
                    requested_at = time.monotonic()
                    target = await asyncio.to_thread(stable.resilient.resilient_target, candidate)
                except Exception:
                    target = None
                await ensure_ble()
                if (target and target["distance"] <= stable.LOCK_RANGE_KM and
                        time.monotonic() - requested_at <= TARGET_LOOKUP_MAX_AGE):
                    selection = candidate
                    initial_target = target
                    initial_target_started = requested_at
                    break
                if target:
                    print(f"CURRENT {target['callsign']} {target['distance']:.1f} km - waiting for 12 km", flush=True)
                else:
                    print("CURRENT found - waiting for position...", flush=True)
            else:
                print("Waiting for ribbon CURRENT...", flush=True)

            await stop_motion()
            await asyncio.sleep(0.7)

        print(f"LOCKED {selection['callsign']} - stable filtered tracking", flush=True)
        panel_mode = 'TRACKING'
        panel_target = selection['callsign']
        started = time.monotonic()
        filtered_bearing = None
        filtered_elevation = None
        desired_yaw = home_yaw
        desired_pitch = home_pitch

        # Only this background task performs blocking aircraft lookups. Each
        # lookup is still off the event loop, but the motor loop no longer
        # awaits it. One outstanding lookup at a time avoids overlapping
        # access to the original helpers' caches and selection state.
        updates = dict(sequence=0, target=initial_target,
                       requested_at=initial_target_started,
                       completed_at=started, current=selection)

        async def poll_aircraft():
            next_target = time.monotonic() + stable.TARGET_REFRESH_SECONDS
            next_ribbon = time.monotonic() + stable.RIBBON_CHECK_SECONDS
            while True:
                await asyncio.sleep(max(0, min(next_target, next_ribbon) - time.monotonic()))
                if time.monotonic() >= next_target:
                    requested_at = time.monotonic()
                    try:
                        target = await asyncio.to_thread(stable.resilient.resilient_target, selection)
                    except Exception:
                        target = None
                    completed_at = time.monotonic()
                    updates.update(sequence=updates['sequence'] + 1, target=target,
                                   requested_at=requested_at, completed_at=completed_at)
                    # No catch-up bursts or unbounded request queue after a
                    # slow response. Never fabricate an aircraft data age.
                    next_target = max(requested_at + stable.TARGET_REFRESH_SECONDS,
                                      completed_at + stable.CONTROL_SECONDS)
                if time.monotonic() >= next_ribbon:
                    requested_at = time.monotonic()
                    try:
                        engine = await asyncio.to_thread(stable.geom.base.fetch_engine)
                        current = await asyncio.to_thread(stable.ribbon_current, engine)
                    except Exception:
                        current = None
                    updates['current'] = current
                    next_ribbon = max(requested_at + stable.RIBBON_CHECK_SECONDS,
                                      time.monotonic() + stable.CONTROL_SECONDS)

        poller = asyncio.create_task(poll_aircraft())
        consumed_sequence = -1
        last_valid_lookup_started = initial_target_started

        while time.monotonic() - started < stable.MAX_TRACK_SECONDS:
            now = time.monotonic()
            await ensure_ble()

            if poller.done():
                # Surface an unexpected worker failure rather than silently
                # keeping the last setpoint forever.
                await poller
                raise SafetyStop("aircraft polling stopped unexpectedly")

            current = updates['current']
            if current and stable.clean_hex(current.get("hex")) != selection["hex"]:
                print(f"Ribbon changed to {current.get('callsign') or 'another aircraft'} - ending track.", flush=True)
                break

            if updates['sequence'] != consumed_sequence:
                consumed_sequence = updates['sequence']
                target = updates['target']
                lookup_age = now - updates['requested_at']
                if target is not None and lookup_age <= TARGET_LOOKUP_MAX_AGE:
                    last_valid_lookup_started = updates['requested_at']
                    filtered_bearing = stable.smooth_angle(filtered_bearing, target["bearing"], stable.BEARING_ALPHA)
                    if filtered_elevation is None:
                        filtered_elevation = target["elevation"]
                    else:
                        filtered_elevation += stable.ELEVATION_ALPHA * (target["elevation"] - filtered_elevation)

                    relative_pan = wrap180(filtered_bearing - stable.geom.REFERENCE_BEARING_DEG)
                    if abs(relative_pan) > stable.MAX_RELATIVE_PAN_DEG:
                        print("Target left safe pan sector - ending track.", flush=True)
                        break

                    filtered_elevation = max(-stable.MAX_DOWN_ELEV_DEG, min(stable.MAX_UP_ELEV_DEG, filtered_elevation))
                    desired_yaw = wrap180(home_yaw + relative_pan)
                    desired_pitch = wrap180(home_pitch - (filtered_elevation - stable.geom.HOME_REFERENCE_ELEV_DEG))

                    print(
                        f"{target['callsign']} {target['distance']:.2f} km "
                        f"bearing {target['bearing']:.1f}->{filtered_bearing:.1f} "
                        f"elev {target['elevation']:.1f}->{filtered_elevation:.1f}",
                        flush=True,
                    )
                    print(
                        f"AIM raw={target['bearing'] % 360:.2f} processed={filtered_bearing % 360:.2f} "
                        f"yaw_wanted={desired_yaw:+.2f} yaw_actual={latest_yaw:+.2f} "
                        f"yaw_error={stable.angle_error(desired_yaw, latest_yaw):+.2f} "
                        f"pitch_wanted={desired_pitch:+.2f} pitch_actual={latest_pitch:+.2f} "
                        f"home_yaw={home_yaw:+.2f} home_pitch={home_pitch:+.2f} "
                        f"telemetry_age={time.monotonic()-guard.telemetry_at:.3f}s "
                        f"lookup_age={lookup_age:.3f}s "
                        f"lookup_seconds={updates['completed_at']-updates['requested_at']:.3f}s "
                        f"motion_gap_max={max_motion_write_gap:.3f}s "
                        f"telemetry_gap_max={max_telemetry_gap:.3f}s "
                        f"source={target.get('source', 'unknown')}", flush=True)

            if now - last_valid_lookup_started > TARGET_LOOKUP_MAX_AGE:
                print("No timely target lookup for 4 seconds - ending track.", flush=True)
                break

            if latest_yaw is not None and latest_pitch is not None:
                framed_yaw, framed_pitch = desired_yaw, desired_pitch
                if panel is not None:
                    pan_trim, tilt_trim = panel.offsets()
                    framed_yaw, framed_pitch = framed_targets(
                        desired_yaw, desired_pitch, pan_trim, tilt_trim,
                        home_yaw, home_pitch, stable.geom.HOME_REFERENCE_ELEV_DEG,
                        stable.MAX_RELATIVE_PAN_DEG, stable.MAX_DOWN_ELEV_DEG, stable.MAX_UP_ELEV_DEG)
                ye = stable.angle_error(framed_yaw, latest_yaw)
                pe = stable.angle_error(framed_pitch, latest_pitch)
                panel_ready = abs(ye) <= 2 and abs(pe) <= 2
                pan = stable.tracking_pan_speed(ye)
                tilt = stable.tracking_tilt_speed(pe)
                await send(tilt, pan)
                await asyncio.sleep(stable.CONTROL_SECONDS)
            else:
                await asyncio.sleep(stable.CONTROL_SECONDS)

        panel_ready = False
        panel_mode = 'RETURNING'
        if panel is not None:
            panel.update(panel_mode)
        poller.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await poller
        poller = None
        await stop_motion()
        await ensure_ble()
        if await return_home():
            print("TOWER JOYSTICK V1 TEST COMPLETE - ORIGINAL HOME ANGLES REACHED.", flush=True)
            result = 0
        else:
            print("HOME NOT REACHED. Check framing before another run.", flush=True)
            result = 3

    except (KeyboardInterrupt, asyncio.CancelledError):
        guard.trip("run cancelled by operator")
        result = 130
    except Exception as exc:
        guard.trip(f"{type(exc).__name__}: {exc}")
        print("RUN ABORTED. No automatic HOME after a safety fault. Re-centre radar before restarting.", flush=True)
        result = 2
    finally:
        panel_ready = False
        panel_mode = 'FAULT' if guard.reason else 'STOPPED'
        if panel is not None:
            panel.update(panel_mode)
        if poller is not None:
            poller.cancel()
            with contextlib.suppress(asyncio.CancelledError, Exception):
                await poller
        # Cancelled lookups have no motor access. A running to_thread request
        # may finish during asyncio.run's executor shutdown, AFTER STOP and
        # disconnect below, and before main restores helper configuration.
        if watcher is not None:
            if guard.reason:
                try:
                    await asyncio.wait_for(asyncio.shield(watcher), 12)
                except (Exception, asyncio.CancelledError):
                    watcher.cancel()
            else:
                watcher.cancel()
            with contextlib.suppress(asyncio.CancelledError, Exception):
                await watcher
        await emergency_stop()
        await disconnect_ble()
        if panel is not None:
            with contextlib.suppress(Exception):
                await asyncio.wait_for(asyncio.to_thread(panel.close), 4)
        if guard.reason and result in (0, 3):
            result = 2
            print("Final connection/STOP fault: visual HOME must be re-established before reuse.", flush=True)
        if guard.home is not None:
            print(f"FINAL SAVED HOME yaw={guard.home[0]:+.2f} pitch={guard.home[1]:+.2f}; never rebased.", flush=True)
        telemetry_age = None if guard.telemetry_at is None else time.monotonic() - guard.telemetry_at
        print(f"TIMING motion_gap_max={max_motion_write_gap:.3f}s "
              f"telemetry_gap_max={max_telemetry_gap:.3f}s last_telemetry_age={telemetry_age}", flush=True)
        print(f"Finished with status {result}.", flush=True)
    return result


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--check", action="store_true", help="Read-only configuration check (default).")
    mode.add_argument("--track-one", action="store_true", help="Enable guarded one-aircraft tracking after visual confirmation.")
    parser.add_argument("--radar-centred", action="store_true", help="Confirm the radar top is centred NOW, tripod stationary.")
    parser.add_argument("--controller-dir", type=Path, default=Path("/home/mike"))
    parser.add_argument("--panel-url", default="https://mikeaircraft.vercel.app", help="HTTPS origin of the existing control panel.")
    args = parser.parse_args(argv)
    if args.track_one and not args.radar_centred:
        parser.error("Tracking requires --radar-centred; no Bluetooth connection was made.")
    try:
        directory = args.controller_dir.resolve()
        sources = verify_sources(directory)
        reference = calculate_alignment(sources)
    except (OSError, ValueError, SyntaxError, RuntimeError) as exc:
        print(f"CHECK FAILED: {exc}", flush=True)
        return 1

    print("TOWER JOYSTICK V1 - INDEPENDENT DATA POLLING / IMMUTABLE HOME GUARD", flush=True)
    print("All 6 installed controller files match the reviewed Pi versions.", flush=True)
    print(f"Camera: {reference['CAMERA_LAT']:.7f}, {reference['CAMERA_LON']:.7f}, altitude {reference['CAMERA_ALT_M']:.1f} m (existing value)", flush=True)
    print(f"Reference: {reference['bearing']:.3f} deg TRUE, {reference['distance_km']:.3f} km, elevation +{reference['elevation']:.3f} deg (initial estimate)", flush=True)
    print(f"Original acquisition area preserved: {reference['gate_start']:.1f} to {reference['gate_end']:.1f} deg TRUE.", flush=True)
    print(f"From tower HOME that is {reference['right_min']:.3f} to {reference['right_max']:.3f} deg RIGHT.", flush=True)
    print("Manual framing: bounded +/-5 degree session trims; right = pan right, up = tilt up. HOME never changes.", flush=True)
    print("Existing speed tables, filter/lead, acquisition sector and geometry retained.", flush=True)
    print("NEW: any connection gap invalidates the run; no HOME rebasing or automatic resume.", flush=True)
    print("NEW: fresh telemetry and control watchdogs; reconnect is neutral STOP ONLY.", flush=True)
    print("NEW: aircraft lookups no longer block the 0.05-second motor-command loop.", flush=True)
    print("Target lookups expire after 4 seconds; this is NOT a measurement of ADS-B position age.", flush=True)
    print("NOT precision-validated: approximate image centring and existing camera altitude.", flush=True)
    if not args.track_one:
        print("CHECK ONLY: no Bluetooth, no movement, no aircraft requests, no files changed.", flush=True)
        print("Calibration has NOT been applied to a running controller.", flush=True)
        return 0

    print("Before connecting: the radar top must be centred NOW at your chosen zoom.", flush=True)
    try:
        answer = input("Type CENTRED only after checking the live camera image: ")
    except (EOFError, KeyboardInterrupt):
        print("Cancelled before Bluetooth connection.", flush=True)
        return 130
    if answer.strip() != "CENTRED":
        print("Not confirmed. No Bluetooth connection or movement.", flush=True)
        return 2
    try:
        with warnings.catch_warnings():
            warnings.simplefilter('error', getpass.GetPassWarning)
            pin = getpass.getpass("Private control-panel PIN (hidden; NOT your Pi SSH password): ")
        panel = PanelTrim(args.panel_url, pin)
    except (EOFError, KeyboardInterrupt, ValueError, getpass.GetPassWarning):
        print("Panel setup cancelled or no private terminal. Use ssh -t; PIN will not be echoed. No Bluetooth connection.", flush=True)
        return 2
    print("PHYSICAL TEST ENABLED: capture radar HOME, acquire one arrival, track, return HOME.", flush=True)
    print("Initial acquisition may pan about 51-76 degrees RIGHT. Keep the movement area clear.", flush=True)
    print("Keep tripod/camera fixed. Ctrl+C requests STOP; physical stop remains essential if radio is lost.", flush=True)
    log_path = Path(__file__).resolve().parent / ("tower_joystick_v1_" + datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S_%fZ") + ".log")
    try:
        log = log_path.open("x", encoding="utf-8", buffering=1)
    except OSError as exc:
        print(f"Cannot create test log: {exc}. No Bluetooth connection.", flush=True)
        return 1
    print(f"Test log: {log_path}", flush=True)
    original_print = builtins.print
    lead = None
    previous = None
    def tower_print(*values, **kwargs):
        translated = []
        for value in values:
            if isinstance(value, str):
                value = value.replace("HORNBACH", "TOWER RADAR").replace("Hornbach", "tower radar")
            translated.append(value)
        stamp = datetime.now(timezone.utc).isoformat(timespec="milliseconds")
        original_print(stamp, *translated, **kwargs)
        try:
            log.write(stamp + " " + " ".join(str(value) for value in translated) + "\n")
        except OSError:
            original_print("WARNING: diagnostic log write failed; console output remains available.", flush=True)
    try:
        lead = load_controller(directory)
        previous = (lead.stable.geom.REFERENCE_BEARING_DEG, lead.stable.geom.HOME_REFERENCE_ELEV_DEG,
                    lead.RIGHT_MIN_DEG, lead.RIGHT_MAX_DEG)
        apply_reference(lead, reference)
        builtins.print = tower_print
        return asyncio.run(guarded_main(lead.stable, panel=panel))
    except KeyboardInterrupt:
        original_print("Tracking interrupted; guarded cleanup was invoked. Check the gimbal is stopped.", flush=True)
        return 130
    except Exception as exc:
        original_print(f"TOWER TEST FAILED: {type(exc).__name__}: {exc}", flush=True)
        return 1
    finally:
        builtins.print = original_print
        log.close()
        if lead is not None and previous is not None:
            (lead.stable.geom.REFERENCE_BEARING_DEG, lead.stable.geom.HOME_REFERENCE_ELEV_DEG,
             lead.RIGHT_MIN_DEG, lead.RIGHT_MAX_DEG) = previous
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
