import asyncio
import math
from pathlib import Path
import sys
import types
import unittest


SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"
sys.path.insert(0, str(SCRIPTS))

from production_tracker import (AdsbObservationIntake, BleLifecycleError, DjiFrameDecoder, client_connected,
                                configured_effective_latency_s, effective_write_hz, make_disconnect_callback,
                                observation_from_adsb, prepare_rs4_gatt,
                                rs4_protocol_response)  # noqa: E402
from production_tracking import CameraReference, ControllerV1, GeometryTargetSource  # noqa: E402


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

    def test_geometric_altitude_has_precedence_over_legacy_pressure_altitude(self):
        geometric = observation_from_adsb(
            {"lat": 50.0, "lon": 14.0, "seen_pos": 0.5,
             "alt_geom": 4000, "altitude": 3900},
            "abc123", 2000.0, 2_000_000)
        self.assertEqual(geometric.altitude_source, "ADS_B_GEOMETRIC")
        self.assertAlmostEqual(geometric.altitude_ellipsoid_m, 1219.2)
        self.assertIsNone(geometric.altitude_barometric_m)

    def test_legacy_pressure_altitude_and_rate_preserve_units_and_provenance(self):
        barometric = observation_from_adsb(
            {"lat": 50.0, "lon": 14.0, "seen_pos": 0.5,
             "altitude": 36000, "vert_rate": -640},
            "abc123", 2000.0, 2_000_000)
        self.assertEqual(barometric.altitude_source,
                         "DUMP1090_LEGACY_PRESSURE_ALTITUDE_APPROXIMATE")
        self.assertIsNone(barometric.altitude_ellipsoid_m)
        self.assertAlmostEqual(barometric.altitude_barometric_m, 10972.8)
        self.assertEqual(barometric.vertical_rate_ft_min, -640.0)
        self.assertEqual(barometric.vertical_rate_source,
                         "DUMP1090_LEGACY_BAROMETRIC_RATE")

    def test_ground_missing_and_invalid_legacy_altitude_do_not_invent_pitch(self):
        camera = CameraReference(50.0, 14.0, 360.0, 0.0, 0.0, 1)
        for value in ("ground", None, float("nan"), float("inf"), True):
            aircraft = {"lat": 50.1, "lon": 14.0, "seen_pos": 0.1}
            if value is not None:
                aircraft["altitude"] = value
            observation = observation_from_adsb(aircraft, "abc123", 2000.0, 2_000_000)
            self.assertIsNone(observation.altitude_ellipsoid_m)
            self.assertIsNone(observation.altitude_barometric_m)
            source = GeometryTargetSource(camera)
            self.assertTrue(source.update(observation))
            target = source.latest(2_000_000)
            self.assertFalse(target.vertical_valid)
            self.assertIsNone(target.target_pitch_relative_deg)

    def test_legacy_pressure_altitude_creates_acquisition_pitch_and_tilt(self):
        camera = CameraReference(50.0, 14.0, 360.0, 0.0, 0.0, 1)
        # About 15 km north and 10,000 ft pressure altitude.
        observation = observation_from_adsb(
            {"lat": 50.1349, "lon": 14.0, "seen_pos": 0.1,
             "altitude": 10000, "vert_rate": 0},
            "abc123", 2000.0, 2_000_000)
        source = GeometryTargetSource(camera)
        self.assertTrue(source.update(observation))
        target = source.latest(2_000_000)
        self.assertTrue(target.vertical_valid)
        self.assertEqual(target.altitude_source,
                         "DUMP1090_LEGACY_PRESSURE_ALTITUDE_APPROXIMATE")
        self.assertIsNotNone(target.target_pitch_relative_deg)
        output = ControllerV1().step(target, 0.05)
        self.assertIsNotNone(output.pitch_error_deg)
        self.assertNotEqual(output.tilt_command, 0)

    def test_representative_datum_error_fits_300mm_vertical_half_frame(self):
        # A stated 300 m pressure/geoid mismatch at 15 km is 1.146 degrees.
        # The XA60 16:9 model has a 4.049-degree vertical FOV at 300 mm.
        datum_error_deg = math.degrees(math.atan2(300.0, 15000.0))
        sensor_height_35mm_equivalent = math.hypot(36.0, 24.0) * 9.0 / math.hypot(16.0, 9.0)
        vertical_fov_deg = math.degrees(
            2.0 * math.atan2(sensor_height_35mm_equivalent, 2.0 * 300.0))
        self.assertAlmostEqual(datum_error_deg, 1.1458, places=3)
        self.assertAlmostEqual(vertical_fov_deg, 4.0495, places=3)
        self.assertLess(datum_error_deg, vertical_fov_deg / 2.0)

    def test_invalid_legacy_vertical_rate_is_rejected(self):
        for value in ("640", float("nan"), float("inf"), True):
            observation = observation_from_adsb(
                {"lat": 50.0, "lon": 14.0, "seen_pos": 0.1,
                 "altitude": 10000, "vert_rate": value},
                "abc123", 2000.0, 2_000_000)
            self.assertIsNone(observation.vertical_rate_ft_min)
            self.assertEqual(observation.vertical_rate_source, "UNAVAILABLE")

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


if __name__ == "__main__":
    unittest.main()
