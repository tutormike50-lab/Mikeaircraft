import asyncio
from pathlib import Path
import sys
import types
import unittest
from unittest import mock


SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"
sys.path.insert(0, str(SCRIPTS))

import production_tracker  # noqa: E402
from production_tracker import (AdsbObservationIntake, BleLifecycleError, DjiFrameDecoder, apply_framing_trim, build_joystick_frame, client_connected,
                                configured_effective_latency_s, effective_write_hz, make_disconnect_callback,
                                observation_from_adsb, prepare_rs4_gatt,
                                rs4_protocol_response)  # noqa: E402
from production_tracking import CameraReference, ControllerV1, GeometryTarget, GeometryTargetSource  # noqa: E402


class FakeTx:
    def __init__(self, events):
        self.events = events
        self.reads = 0

    @property
    def max_write_without_response_size(self):
        self.reads += 1
        self.events.append(f"size:{self.reads}")
        return 20 if self.reads == 1 else 22


class ProductionTrackerBleTests(unittest.IsolatedAsyncioTestCase):
    def test_effective_latency_configuration_is_bounded(self):
        self.assertEqual(configured_effective_latency_s("0.50"), 0.5)
        with self.assertRaises(ValueError):
            configured_effective_latency_s("-0.1")

    def test_only_geometric_altitude_enables_vertical_tracking(self):
        geometric = observation_from_adsb(
            {"lat": 50.0, "lon": 14.0, "seen_pos": 0.5,
             "alt_geom": 4000, "alt_baro": 3900},
            "abc123", 2000.0, 2_000_000)
        self.assertEqual(geometric.altitude_source, "ADS_B_GEOMETRIC")
        self.assertAlmostEqual(geometric.altitude_ellipsoid_m, 1219.2)
        legacy = observation_from_adsb(
            {"lat": 50.0, "lon": 14.0, "seen_pos": 0.5, "altitude": 3900},
            "abc123", 2000.0, 2_000_000)
        self.assertEqual(legacy.altitude_source,
                         "DUMP1090_LEGACY_PRESSURE_ALTITUDE_APPROXIMATE")
        self.assertIsNone(legacy.altitude_ellipsoid_m)
        self.assertAlmostEqual(legacy.altitude_barometric_m, 1188.72)
        source = GeometryTargetSource(
            CameraReference(50.001, 14.001, 300.0, 0.0, 0.0, 1))
        self.assertTrue(source.update(legacy))
        self.assertTrue(source.latest(1_999_500).vertical_valid)

        for unusable in (None, "3900", float("nan")):
            missing = observation_from_adsb(
                {"lat": 50.0, "lon": 14.0, "seen_pos": 0.5, "altitude": unusable},
                "abc123", 2000.0, 2_000_000)
            self.assertEqual(missing.altitude_source, "UNAVAILABLE")
            self.assertIsNone(missing.altitude_ellipsoid_m)
            self.assertIsNone(missing.altitude_barometric_m)

    def test_frozen_source_keeps_identity_and_age_without_new_measurement(self):
        intake = AdsbObservationIntake()
        aircraft = {"hex": "abc123", "lat": 50.0, "lon": 14.0,
                    "seen_pos": 0.2, "gs": 200, "track": 90}
        first = intake.ingest({"now": 2000.0}, aircraft, "abc123", 2_000_000)
        source = GeometryTargetSource(
            CameraReference(50.1, 14.1, 300.0, 0.0, 0.0, 1), stale_age_s=5.0)
        self.assertTrue(source.update(first.observation))
        frozen = dict(aircraft, seen_pos=1.2)
        second = intake.ingest({"now": 2001.0}, frozen, "abc123", 2_001_000)

        self.assertEqual(first.observation.timestamp_ms, 1_999_800)
        self.assertEqual(first.diagnostics["source_update_identity"],
                         second.diagnostics["source_update_identity"])
        self.assertTrue(second.duplicate)
        self.assertIsNone(second.observation)
        self.assertEqual(second.diagnostics["source_age_ms"], 1200)
        self.assertEqual(source.latest(2_004_800).source_age_ms, 5000)
        self.assertEqual(source.latest(2_004_801).status, "STALE")

    def test_genuine_new_source_position_is_accepted_once(self):
        intake = AdsbObservationIntake()
        first = intake.ingest({"now": 2000.0},
                              {"lat": 50.0, "lon": 14.0, "seen_pos": 0.2},
                              "abc123", 2_000_000)
        newer = intake.ingest({"now": 2001.0},
                              {"lat": 50.001, "lon": 14.001, "seen_pos": 0.1},
                              "abc123", 2_001_000)
        repeat = intake.ingest({"now": 2001.0},
                               {"lat": 50.001, "lon": 14.001, "seen_pos": 0.1},
                               "abc123", 2_001_200)

        self.assertFalse(first.duplicate)
        source = GeometryTargetSource(
            CameraReference(50.1, 14.1, 300.0, 0.0, 0.0, 1))
        self.assertTrue(source.update(first.observation))
        self.assertTrue(source.update(newer.observation))
        self.assertEqual(newer.observation.timestamp_ms, 2_000_900)
        self.assertNotEqual(first.diagnostics["source_update_identity"],
                            newer.diagnostics["source_update_identity"])
        self.assertTrue(repeat.duplicate)
        self.assertIsNone(repeat.observation)

    def test_invalid_future_missing_and_backward_source_timing_is_explicit(self):
        cases = [
            ({}, {"lat": 50.0, "lon": 14.0, "seen_pos": 0.1}),
            ({"now": 2000.0}, {"lat": 50.0, "lon": 14.0}),
            ({"now": 2000.0}, {"lat": 50.0, "lon": 14.0, "seen_pos": -1}),
            ({"now": 2010.0}, {"lat": 50.0, "lon": 14.0, "seen_pos": 0.0}),
        ]
        for feed, aircraft in cases:
            result = AdsbObservationIntake().ingest(feed, aircraft, "abc123", 2_000_000)
            self.assertEqual(result.diagnostics["timing_status"], "INVALID")
            self.assertIsNone(result.observation)
            self.assertIn("timing_error", result.diagnostics)

        intake = AdsbObservationIntake()
        self.assertIsNotNone(intake.ingest(
            {"now": 2000.0}, {"lat": 50.0, "lon": 14.0, "seen_pos": 0.1},
            "abc123", 2_000_000).observation)
        backward = intake.ingest(
            {"now": 1998.0}, {"lat": 50.1, "lon": 14.1, "seen_pos": 0.1},
            "abc123", 2_001_000)
        self.assertEqual(backward.diagnostics["timing_status"], "INVALID")
        self.assertIn("backward", backward.diagnostics["timing_error"])

    def test_captured_rs4_requests_produce_exact_official_app_responses(self):
        captures = [
            ("551204c70402a8ee0004380000646400bc01",
             "550d04330204a8ee8004389e9f"),
            ("551204c70402a9ee2004640000000000e78e",
             "550d04330204a9ee800464330c"),
            ("550d0433270207014000003e42",
             "550d043302270701800000634a"),
        ]
        for request, response in captures:
            self.assertEqual(rs4_protocol_response(bytes.fromhex(request)),
                             bytes.fromhex(response))

    def test_decoder_reassembles_and_separates_captured_frames(self):
        first = bytes.fromhex("551204c70402a8ee0004380000646400bc01")
        second = bytes.fromhex("551204c70402a9ee2004640000000000e78e")
        decoder = DjiFrameDecoder()
        self.assertEqual(decoder.feed(first[:7]), [])
        self.assertEqual(decoder.feed(first[7:] + second), [first, second])

    def test_unrelated_telemetry_does_not_generate_protocol_response(self):
        telemetry = bytes.fromhex(
            "553e044b0402a8ee00040507070000a0fe84005b010001b2f7250053d00000"
            "e4ff0800b3090d3ab8f65f3f07fff73e138f533b0000000001000000008259")
        self.assertIsNone(rs4_protocol_response(telemetry))

    def test_effective_write_rate_counts_intervals(self):
        self.assertEqual(effective_write_hz(0, None, None), 0.0)
        self.assertEqual(effective_write_hz(1, 10.0, 10.0), 0.0)
        self.assertAlmostEqual(effective_write_hz(21, 10.0, 11.0), 20.0)

    def test_lifecycle_error_preserves_stage_cause_and_disconnect_time(self):
        original = RuntimeError("Not connected")
        try:
            try:
                raise original
            except RuntimeError as error:
                raise BleLifecycleError("command_write", str(error), 12.5) from error
        except BleLifecycleError as fault:
            self.assertEqual(fault.stage, "command_write")
            self.assertIs(fault.__cause__, original)
            self.assertIn("disconnect_monotonic_s=12.500000", str(fault))

    def test_connection_probe_is_safe_during_cleanup(self):
        class ConnectedClient:
            is_connected = True

        class DisconnectedClient:
            is_connected = False

        class BrokenClient:
            @property
            def is_connected(self):
                raise RuntimeError("backend already gone")

        self.assertTrue(client_connected(ConnectedClient()))
        self.assertFalse(client_connected(DisconnectedClient()))
        self.assertFalse(client_connected(None))
        self.assertFalse(client_connected(BrokenClient()))

    def test_post_connect_disconnect_records_only_active_unexpected_client(self):
        active = object()
        stale = object()
        intentional = False
        recorded = []
        callback = make_disconnect_callback(
            lambda: active, lambda: intentional,
            lambda client, occurred_at: recorded.append((client, occurred_at)))

        callback(stale)
        self.assertEqual(recorded, [])
        callback(active)
        self.assertIs(recorded[0][0], active)
        self.assertIsInstance(recorded[0][1], float)
        intentional = True
        callback(active)
        self.assertEqual(len(recorded), 1)

    def test_framing_trim_is_signed_bounded_position_only_and_home_safe(self):
        target = GeometryTarget(
            1000, "abc123", 100.0, 5.0, 12.0, 3.0, 1.25, -0.4,
            900, 1100, 100, 200, 5000.0, 5100.0, "ADS_B", "ADS_B_GEOMETRIC",
            "ADS_B_GROUND_VECTOR", True, True, "VALID")
        zero = apply_framing_trim(target, 0.0, 0.0)
        self.assertIs(zero, target)
        right_up = apply_framing_trim(target, 0.25, 0.25)
        self.assertAlmostEqual(right_up.target_yaw_relative_deg, 12.25)
        self.assertAlmostEqual(right_up.target_pitch_relative_deg, 2.75)
        left_down = apply_framing_trim(target, -0.25, -0.25)
        self.assertAlmostEqual(left_down.target_yaw_relative_deg, 11.75)
        self.assertAlmostEqual(left_down.target_pitch_relative_deg, 3.25)
        self.assertEqual(right_up.target_yaw_rate_deg_s, target.target_yaw_rate_deg_s)
        self.assertEqual(right_up.target_pitch_rate_deg_s, target.target_pitch_rate_deg_s)
        self.assertEqual(right_up.aircraft_id, target.aircraft_id)
        home = GeometryTarget(
            1001, None, 90.0, 2.0, 0.0, 0.0, 0.0, 0.0,
            None, 1101, None, None, None, None, "CAMERA_REFERENCE",
            "CAMERA_REFERENCE", None, True, True, "HOME")
        self.assertIs(apply_framing_trim(home, 5.0, 5.0), home)
        self.assertEqual(home.target_yaw_relative_deg, 0.0)
        self.assertEqual(home.target_pitch_relative_deg, 0.0)

    def test_framing_trim_does_not_carry_aircraft_state(self):
        a = GeometryTarget(
            1000, "aaaaaa", 100.0, 5.0, 12.0, 3.0, 1.25, -0.4,
            900, 1100, 100, 200, 5000.0, 5100.0, "ADS_B", "ADS_B_GEOMETRIC",
            "ADS_B_GROUND_VECTOR", True, True, "VALID")
        b = GeometryTarget(
            1001, "bbbbbb", 102.0, 6.0, 20.0, 4.0, -0.7, 0.2,
            901, 1101, 100, 200, 6000.0, 6100.0, "ADS_B", "ADS_B_GEOMETRIC",
            "ADS_B_GROUND_VECTOR", True, True, "VALID")
        self.assertEqual(apply_framing_trim(a, 0.2, -0.1).aircraft_id, "aaaaaa")
        framed_b = apply_framing_trim(b, 0.2, -0.1)
        self.assertEqual(framed_b.aircraft_id, "bbbbbb")
        self.assertAlmostEqual(framed_b.target_yaw_relative_deg, 20.2)
        self.assertAlmostEqual(framed_b.target_pitch_relative_deg, 4.1)

    def test_joystick_trim_changes_final_controller_and_rs4_packet(self):
        base = GeometryTarget(
            1000, "abc123", 100.0, 5.0, 0.0, 0.0, 0.0, 0.0,
            900, 1100, 100, 200, 5000.0, 5100.0, "ADS_B", "ADS_B_GEOMETRIC",
            "ADS_B_GROUND_VECTOR", True, True, "VALID")
        baseline_controller = ControllerV1()
        baseline_controller.aircraft_id = "abc123"
        baseline_controller.mode = "TRACK"
        baseline = baseline_controller.step(base, 0.05)
        baseline_frame = build_joystick_frame(lambda seq, tilt, pan: (seq, tilt, pan), 10,
                                              baseline.tilt_command, baseline.pan_command)

        right = apply_framing_trim(base, 0.25, 0.0)
        right_controller = ControllerV1()
        right_controller.aircraft_id = "abc123"
        right_controller.mode = "TRACK"
        right_output = right_controller.step(right, 0.05)
        right_frame = build_joystick_frame(lambda seq, tilt, pan: (seq, tilt, pan), 10,
                                           right_output.tilt_command, right_output.pan_command)
        self.assertGreater(right_output.yaw_error_deg, baseline.yaw_error_deg)
        self.assertNotEqual(right_output.pan_command, baseline.pan_command)
        self.assertNotEqual(right_frame, baseline_frame)

        up = apply_framing_trim(base, 0.0, 2.0)
        up_controller = ControllerV1()
        up_controller.aircraft_id = "abc123"
        up_controller.mode = "TRACK"
        up_output = up_controller.step(up, 0.05)
        up_frame = build_joystick_frame(lambda seq, tilt, pan: (seq, tilt, pan), 10,
                                        up_output.tilt_command, up_output.pan_command)
        self.assertLess(up.target_pitch_relative_deg, base.target_pitch_relative_deg)
        self.assertLess(up_output.pitch_error_deg, baseline.pitch_error_deg)
        self.assertNotEqual(up_output.tilt_command, baseline.tilt_command)
        self.assertNotEqual(up_frame, baseline_frame)

    async def test_proven_gatt_lifecycle_waits_notifies_then_resolves_ready_tx(self):
        events = []
        tx = FakeTx(events)

        async def sleep(delay):
            events.append(f"sleep:{delay}")

        class Client:
            async def start_notify(self, uuid, callback):
                events.append(f"notify:{uuid}")

            services = types.SimpleNamespace(
                get_characteristic=lambda uuid: events.append(f"tx:{uuid}") or tx)

        ble = types.SimpleNamespace(RX="rx", TX="tx")
        result = await prepare_rs4_gatt(Client(), ble, lambda *_: None, sleep=sleep)

        self.assertIs(result, tx)
        self.assertEqual(events, [
            "sleep:0.8", "notify:rx", "tx:tx", "size:1", "sleep:0.4", "size:2"
        ])




class TrueNorthOperationalHomeTests(unittest.TestCase):
    def test_loaded_camera_reference_forces_operational_home_true_north(self):
        payload = {
            "ok": True,
            "cameraReference": {
                "lat": 50.0654226,
                "lon": 14.3042639,
                "altitudeM": 360.9,
                "altitudeDatum": "WGS84_ELLIPSOID",
                "source": "BROWSER_GEOLOCATION_MULTI_FIX",
                "calibrationCompletedAt": "2026-09-30T07:30:37.409Z",
                "orientation": {
                    "homeTrueAzimuthDeg": 1.7,
                    "homeElevationDeg": -5.5
                }
            }
        }
        with mock.patch.object(production_tracker, "read_json_url", return_value=payload):
            camera = production_tracker.load_camera_reference("https://example.test", "pin")
        self.assertEqual(camera.home_true_azimuth_deg, 0.0)
        self.assertEqual(camera.home_elevation_deg, -2.0)
        self.assertEqual(camera.latitude_deg, 50.0655668)
        self.assertEqual(camera.longitude_deg, 14.3043564)
        self.assertEqual(camera.altitude_ellipsoid_m, 360.9)

    def test_true_north_relative_yaw_examples(self):
        self.assertEqual(production_tracker.wrap180(30.0 - 0.0), 30.0)
        self.assertEqual(production_tracker.wrap180(330.0 - 0.0), -30.0)
        self.assertEqual(production_tracker.wrap180(0.0 - 0.0), 0.0)



    def test_operational_home_elevation_reduces_target_pitch_by_exactly_one_degree(self):
        old_camera = CameraReference(50.0, 14.0, 300.0, 0.0, -4.5, 1)
        new_camera = CameraReference(50.0, 14.0, 300.0, 0.0, -2.5, 1)
        old_source = GeometryTargetSource(old_camera, effective_latency_s=0.0)
        new_source = GeometryTargetSource(new_camera, effective_latency_s=0.0)
        observation = production_tracker.AircraftObservation(
            "abc123", 1000, 50.05, 14.0, 1000.0, None, None, None)
        self.assertTrue(old_source.update(observation))
        self.assertTrue(new_source.update(observation))
        old_target = old_source.latest(1000)
        new_target = new_source.latest(1000)
        self.assertAlmostEqual(new_target.target_yaw_relative_deg, old_target.target_yaw_relative_deg)
        self.assertAlmostEqual(new_target.target_pitch_relative_deg,
                               old_target.target_pitch_relative_deg - 2.0)
        old_controller = ControllerV1()
        new_controller = ControllerV1()
        old_out = old_controller.step(old_target, 0.05)
        new_out = new_controller.step(new_target, 0.05)
        self.assertEqual(new_out.pan_command, old_out.pan_command)



class FixedAircraftPanAimOffsetTests(unittest.TestCase):
    def test_aircraft_offset_is_minus_five_and_home_is_unchanged(self):
        camera = CameraReference(50.0, 14.0, 300.0, 0.0, -2.5, 1)
        source = GeometryTargetSource(camera, effective_latency_s=0.0)
        observation = production_tracker.AircraftObservation(
            "abc123", 1000, 50.05, 14.0, 1000.0, None, None, None)
        self.assertTrue(source.update(observation))
        raw_target = source.latest(1000)
        aimed = production_tracker.apply_framing_trim(
            raw_target, production_tracker.AIRCRAFT_PAN_AIM_OFFSET_DEG, 0.0)
        self.assertAlmostEqual(production_tracker.AIRCRAFT_PAN_AIM_OFFSET_DEG, -5.0)
        self.assertAlmostEqual(
            production_tracker.wrap180(
                aimed.target_yaw_relative_deg - raw_target.target_yaw_relative_deg),
            -5.0)
        self.assertAlmostEqual(
            aimed.target_pitch_relative_deg, raw_target.target_pitch_relative_deg)

        home = GeometryTarget(
            1001, None, 0.0, -2.5, 0.0, 0.0, 0.0, 0.0,
            None, 1001, None, None, None, None, "CAMERA_REFERENCE",
            "CAMERA_REFERENCE", None, True, True, "HOME")
        home_aimed = production_tracker.apply_framing_trim(
            home, production_tracker.AIRCRAFT_PAN_AIM_OFFSET_DEG, 0.0)
        self.assertIs(home_aimed, home)
        self.assertEqual(home_aimed.target_yaw_relative_deg, 0.0)
        self.assertEqual(home_aimed.target_pitch_relative_deg, 0.0)



class ZoomFramingOffsetTests(unittest.TestCase):
    def test_zoom_offsets_scale_from_zero_at_wide_to_trial_values_at_full(self):
        self.assertEqual(production_tracker.ZOOM_PAN_OFFSET_AT_FULL_DEG * 0.0, 0.0)
        self.assertEqual(production_tracker.ZOOM_TILT_OFFSET_AT_FULL_DEG * 0.0, -0.0)
        self.assertEqual(production_tracker.ZOOM_PAN_OFFSET_AT_FULL_DEG * 0.5, -0.625)
        self.assertEqual(production_tracker.ZOOM_TILT_OFFSET_AT_FULL_DEG * 0.5, -0.25)
        self.assertEqual(production_tracker.ZOOM_PAN_OFFSET_AT_FULL_DEG * 1.0, -1.25)
        self.assertEqual(production_tracker.ZOOM_TILT_OFFSET_AT_FULL_DEG * 1.0, -0.5)

if __name__ == "__main__":
    unittest.main()