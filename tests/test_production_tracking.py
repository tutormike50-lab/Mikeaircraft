"""Focused offline acceptance tests; no network, Bluetooth, or gimbal access."""

from dataclasses import replace
from pathlib import Path
import math
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from production_tracking import (  # noqa: E402
    AircraftObservation, CameraReference, ControllerV1, GeometryTargetSource,
    boresight_corrected_target,
)


class ProductionTrackingTests(unittest.TestCase):
    def setUp(self):
        self.camera = CameraReference(50.0, 14.0, 300.0, 0.0, 0.0, 1)
        self.source = GeometryTargetSource(self.camera, effective_latency_s=0.25,
                                           valid_age_s=0.35, stale_age_s=5.0)
        self.t0 = 2_000_000
        # North-east motion viewed from HOME north gives continuous positive yaw.
        self.observation = AircraftObservation(
            "abc123", self.t0, 50.045, 14.0, 1300.0,
            200.0, 90.0, 0.0,
        )

    def test_geometry_moves_continuously_between_adsb_observations(self):
        self.assertTrue(self.source.update(self.observation))
        samples = [self.source.latest(self.t0 + offset) for offset in (0, 50, 100, 150, 200)]
        yaw = [target.target_yaw_relative_deg for target in samples]
        self.assertTrue(all(right > left for left, right in zip(yaw, yaw[1:])), yaw)
        self.assertTrue(all(target.target_yaw_rate_deg_s > 0.5 for target in samples))
        self.assertEqual([target.status for target in samples], ["VALID"] * 5)

    def test_predicted_feed_forward_does_not_decay_between_reports(self):
        self.source.update(self.observation)
        targets = [self.source.latest(self.t0 + offset) for offset in (400, 1000, 2000, 4000)]
        self.assertTrue(all(target.status == "PREDICTED" for target in targets))
        rates = [target.target_yaw_rate_deg_s for target in targets]
        self.assertGreater(min(rates), 0.5)
        self.assertLess(max(rates) - min(rates), 0.15)

    def test_stale_and_invalid_are_deterministic(self):
        self.source.select_aircraft("abc123")
        self.assertEqual(self.source.latest(self.t0).status, "INVALID")
        self.source.update(self.observation)
        stale = self.source.latest(self.t0 + 5001)
        self.assertEqual(stale.status, "STALE")
        controller = ControllerV1(stale_ramp_dps2=10.0)
        controller.reset_target("abc123")
        controller.last_yaw_rate = 3.0
        output = controller.step(stale, 0.05)
        self.assertEqual(output.state, "HOLD")
        self.assertAlmostEqual(output.requested_yaw_rate_deg_s, 2.5)
        invalid_source = GeometryTargetSource(self.camera)
        invalid_source.select_aircraft("abc123")
        invalid = invalid_source.latest(self.t0)
        output = controller.step(invalid, 0.05)
        self.assertEqual((output.state, output.pan_command, output.tilt_command), ("FAULT", 0, 0))

    def test_polling_cannot_reset_stale_source_age(self):
        self.assertTrue(self.source.update(self.observation))
        for offset in (200, 400, 1000, 3000, 5000):
            self.assertFalse(self.source.update(self.observation))
            self.assertEqual(self.source.latest(self.t0 + offset).source_age_ms, offset)
        self.assertEqual(self.source.latest(self.t0 + 5001).status, "STALE")

    def test_controller_consumes_geometry_rate_and_reacquires_on_id_change(self):
        self.source.update(self.observation)
        controller = ControllerV1(capture_cycles=2)
        first = self.source.latest(self.t0)
        output = controller.step(first, 0.05)
        self.assertEqual(controller.aircraft_id, "abc123")
        self.assertEqual(output.state, "ACQUIRE")
        # With zero pointing error, the direct GeometryTarget feed-forward still commands motion.
        controller.estimated_yaw_deg = first.target_yaw_relative_deg
        output = controller.step(first, 0.05)
        self.assertNotEqual(output.pan_command, 0)
        replacement = AircraftObservation("def456", self.t0 + 1000, 50.045, 14.001,
                                          1300.0, 180.0, 270.0, 0.0)
        self.source.update(replacement)
        output = controller.step(self.source.latest(self.t0 + 1000), 0.05)
        self.assertEqual(controller.aircraft_id, "def456")
        self.assertEqual(output.state, "ACQUIRE")

    def test_barometric_altitude_is_not_silently_used_for_pitch(self):
        no_vertical = AircraftObservation("abc123", self.t0, 50.045, 14.0, None,
                                          200.0, 90.0, None,
                                          altitude_source="UNAVAILABLE_BAROMETRIC_NOT_SUBSTITUTED")
        self.source.update(no_vertical)
        target = self.source.latest(self.t0)
        self.assertTrue(target.horizontal_valid)
        self.assertFalse(target.vertical_valid)
        self.assertIsNone(target.target_pitch_relative_deg)
        self.assertEqual(target.target_pitch_rate_deg_s, 0.0)

    def test_duplicate_adsb_observation_does_not_create_a_motor_step(self):
        self.assertTrue(self.source.update(self.observation))
        before = self.source.latest(self.t0 + 100)
        self.assertFalse(self.source.update(self.observation))
        after = self.source.latest(self.t0 + 150)
        self.assertGreater(after.target_yaw_relative_deg, before.target_yaw_relative_deg)

    def test_no_current_returns_home_and_new_current_reacquires(self):
        controller = ControllerV1(max_yaw_accel_dps2=20.0)
        controller.estimated_yaw_deg = 12.0
        home = self.source.latest(self.t0)
        first = controller.step(home, 0.05)
        self.assertEqual(first.state, "RETURN_HOME")
        self.assertLess(first.requested_yaw_rate_deg_s, 0.0)
        self.assertLessEqual(abs(first.requested_yaw_rate_deg_s), 1.0)
        controller.estimated_yaw_deg = controller.estimated_pitch_deg = 0.0
        self.assertEqual(controller.step(home, 0.05).state, "HOLD_HOME")
        self.source.update(self.observation)
        self.assertEqual(controller.step(self.source.latest(self.t0), 0.05).state, "ACQUIRE")

    def test_latency_is_applied_once_from_observation_timestamp(self):
        self.source.update(self.observation)
        target = self.source.latest(self.t0 + 400)
        self.assertEqual(target.source_age_ms, 400)
        self.assertEqual(target.prediction_age_ms, 650)
        self.assertEqual(target.aim_timestamp_ms, self.t0 + 650)

    def test_acquire_rate_is_acceleration_and_braking_bounded(self):
        self.source.update(self.observation)
        controller = ControllerV1(max_yaw_accel_dps2=20.0)
        target = self.source.latest(self.t0)
        outputs = [controller.step(target, 0.05) for _ in range(5)]
        rates = [item.requested_yaw_rate_deg_s for item in outputs]
        self.assertTrue(all(right - left <= 1.000001 for left, right in zip(rates, rates[1:])))
        self.assertTrue(all(abs(rate) <= math.sqrt(40.0 * abs(item.yaw_error_deg)) + 1e-6
                            for rate, item in zip(rates, outputs)))

    def test_acquire_settles_to_track_without_shooting_past(self):
        self.source.update(self.observation)
        target = replace(self.source.latest(self.t0), target_yaw_relative_deg=12.0,
                         target_yaw_rate_deg_s=0.0)
        controller = ControllerV1(capture_cycles=4, max_yaw_accel_dps2=20.0)
        positions = []
        states = []
        for _ in range(300):
            output = controller.step(target, 0.05)
            positions.append(controller.estimated_yaw_deg)
            states.append(output.state)
        self.assertIn("TRACK", states)
        self.assertLessEqual(max(positions), 12.35)
        self.assertAlmostEqual(positions[-1], 12.0, delta=0.35)

    def test_large_position_correction_cannot_reverse_velocity(self):
        self.source.update(self.observation)
        later = AircraftObservation("abc123", self.t0 + 1000, 50.045, 14.0001,
                                    1300.0, 200.0, 90.0, 0.0)
        self.assertTrue(self.source.update(later))
        target = self.source.latest(self.t0 + 1000)
        self.assertGreater(target.target_yaw_rate_deg_s, 0.0)

    def test_boresight_changes_only_final_angles_not_rates_or_ownership(self):
        self.source.update(self.observation)
        target = self.source.latest(self.t0)
        corrected = boresight_corrected_target(target, -0.35, 0.12)
        self.assertAlmostEqual(corrected.target_yaw_relative_deg,
                               target.target_yaw_relative_deg - 0.35)
        self.assertAlmostEqual(corrected.target_pitch_relative_deg,
                               target.target_pitch_relative_deg + 0.12)
        self.assertEqual(corrected.target_yaw_rate_deg_s, target.target_yaw_rate_deg_s)
        self.assertEqual(corrected.target_pitch_rate_deg_s, target.target_pitch_rate_deg_s)
        self.assertEqual(corrected.aircraft_id, target.aircraft_id)

    def test_inactive_zero_boresight_is_exact_ec9b423_controller_path(self):
        self.source.update(self.observation)
        target = self.source.latest(self.t0 + 150)
        corrected = boresight_corrected_target(target, 0.0, 0.0)
        self.assertIs(corrected, target)

        baseline = ControllerV1()
        centering_capable = ControllerV1()
        baseline.correct_telemetry(1.25, -0.75)
        centering_capable.correct_telemetry(1.25, -0.75)
        expected = baseline.step(target, 0.05)
        actual = centering_capable.step(corrected, 0.05)
        self.assertEqual(actual, expected)
        self.assertEqual(corrected.target_yaw_relative_deg, target.target_yaw_relative_deg)
        self.assertEqual(corrected.target_pitch_relative_deg, target.target_pitch_relative_deg)
        self.assertEqual(corrected.target_yaw_rate_deg_s, target.target_yaw_rate_deg_s)
        self.assertEqual(corrected.target_pitch_rate_deg_s, target.target_pitch_rate_deg_s)


if __name__ == "__main__":
    unittest.main()
