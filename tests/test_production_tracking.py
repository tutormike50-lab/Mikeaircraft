"""Focused offline acceptance tests; no network, Bluetooth, or gimbal access."""

from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from production_tracking import (  # noqa: E402
    AircraftObservation, CameraReference, ControllerV1, GeometryTargetSource,
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
        invalid = GeometryTargetSource(self.camera).latest(self.t0)
        output = controller.step(invalid, 0.05)
        self.assertEqual((output.state, output.pan_command, output.tilt_command), ("FAULT", 0, 0))

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


if __name__ == "__main__":
    unittest.main()
