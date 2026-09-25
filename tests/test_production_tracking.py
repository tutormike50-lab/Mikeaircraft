"""Focused offline acceptance tests; no network, Bluetooth, or gimbal access."""

from dataclasses import replace
import hashlib
import inspect
from pathlib import Path
import math
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from production_tracking import (  # noqa: E402
    AircraftObservation, CameraReference, ControllerV1, GeometryTargetSource,
    SmoothPitchActuator,
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
        self.assertEqual((output.requested_pitch_rate_deg_s, output.tilt_command),
                         (0.0, 0))
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
        target_rate = target.target_yaw_rate_deg_s
        self.assertTrue(all(abs(rate - target_rate) <= math.sqrt(40.0 * abs(item.yaw_error_deg)) + 1e-6
                            for rate, item in zip(rates, outputs)))

    def test_stationary_target_acquire_still_brakes_safely(self):
        self.source.update(self.observation)
        target = replace(self.source.latest(self.t0), target_yaw_relative_deg=12.0,
                         target_yaw_rate_deg_s=0.0)
        controller = ControllerV1(capture_cycles=1000, max_yaw_accel_dps2=20.0)
        outputs = []
        positions = []
        for _ in range(200):
            outputs.append(controller.step(target, 0.05))
            positions.append(controller.estimated_yaw_deg)
        self.assertTrue(all(abs(item.requested_yaw_rate_deg_s)
                            <= math.sqrt(40.0 * abs(item.yaw_error_deg)) + 1e-6
                            for item in outputs))
        self.assertLessEqual(max(positions), 12.35)
        self.assertAlmostEqual(positions[-1], 12.0, delta=0.35)

    def test_moving_target_feed_forward_survives_acquire_intercept(self):
        self.source.update(self.observation)
        target = replace(self.source.latest(self.t0), target_yaw_relative_deg=0.0,
                         target_yaw_rate_deg_s=-15.0 / 11.0)
        controller = ControllerV1(capture_cycles=1000, max_yaw_accel_dps2=24.0)
        controller.reset_target("abc123")
        controller.estimated_yaw_deg = 0.0
        controller.last_yaw_rate = target.target_yaw_rate_deg_s
        output = controller.step(target, 0.05)
        self.assertEqual(output.state, "ACQUIRE")
        self.assertAlmostEqual(output.requested_yaw_rate_deg_s,
                               target.target_yaw_rate_deg_s, places=9)
        self.assertNotEqual(output.pan_command, 0)

    def test_acquire_damping_brakes_existing_approach_rate_before_intercept(self):
        self.source.update(self.observation)
        target = replace(self.source.latest(self.t0), target_yaw_relative_deg=12.0,
                         target_yaw_rate_deg_s=-0.2)
        controller = ControllerV1(capture_cycles=1000, max_yaw_accel_dps2=24.0)
        controller.reset_target("abc123")
        controller.last_yaw_rate = 10.0
        output = controller.step(target, 0.05)
        self.assertLess(output.requested_yaw_rate_deg_s, 10.0)
        self.assertAlmostEqual(output.requested_yaw_rate_deg_s, 8.8, places=9)

    def test_predicted_target_tracks_normally(self):
        self.source.update(self.observation)
        target = self.source.latest(self.t0 + 1000)
        self.assertEqual(target.status, "PREDICTED")
        controller = ControllerV1(capture_cycles=1000)
        controller.estimated_yaw_deg = target.target_yaw_relative_deg
        controller.last_yaw_rate = target.target_yaw_rate_deg_s
        output = controller.step(target, 0.05)
        self.assertEqual(output.state, "ACQUIRE")
        self.assertAlmostEqual(output.requested_yaw_rate_deg_s,
                               target.target_yaw_rate_deg_s, places=9)

    def test_acquire_to_track_has_no_moving_target_rate_pause(self):
        self.source.update(self.observation)
        target = replace(self.source.latest(self.t0), target_yaw_relative_deg=0.0,
                         target_yaw_rate_deg_s=-15.0 / 11.0)
        controller = ControllerV1(capture_cycles=2, max_yaw_accel_dps2=24.0)
        controller.reset_target("abc123")
        controller.last_yaw_rate = target.target_yaw_rate_deg_s
        outputs = [controller.step(target, 0.05) for _ in range(3)]
        self.assertEqual([item.state for item in outputs], ["ACQUIRE", "TRACK", "TRACK"])
        self.assertTrue(all(abs(item.requested_yaw_rate_deg_s) > 1.0 for item in outputs))

    def test_track_numerical_formula_is_unchanged(self):
        self.source.update(self.observation)
        target = replace(self.source.latest(self.t0), target_yaw_relative_deg=3.0,
                         target_yaw_rate_deg_s=-1.2)
        controller = ControllerV1(max_yaw_accel_dps2=1000.0)
        controller.reset_target("abc123")
        controller.mode = "TRACK"
        output = controller.step(target, 0.05)
        self.assertAlmostEqual(output.requested_yaw_rate_deg_s,
                               -1.2 + controller.track_kp * 3.0, places=9)

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

    def test_yaw_controller_source_guard_matches_b72738c(self):
        # Projection deliberately includes every ControllerV1 source line that
        # mentions yaw plus the shared ACQUIRE/TRACK transition state.  Its
        # expected digest was generated from exact commit b72738c.
        source = inspect.getsource(ControllerV1)
        projection = "\n".join(
            line.rstrip() for line in source.splitlines()
            if ("yaw" in line.lower() or "self.mode" in line or
                "inside_cycles" in line or "capture_cycles" in line or
                "aircraft_id" in line)
            and "pitch" not in line.lower()
        )
        self.assertEqual(hashlib.sha256(projection.encode()).hexdigest(),
                         "2374bd8ecc4b87a1dfd4a9b33f9e5ec479bd9897df716fb307cb2964f7b839ca")

    def test_pitch_law_preserves_feed_forward_and_settles(self):
        actuator = SmoothPitchActuator()
        rate, command = actuator.command(0.0, 0.5, 0.05)
        self.assertAlmostEqual(rate, 0.3)
        self.assertEqual(command, 6)
        for _ in range(10):
            rate, command = actuator.command(0.0, 0.0, 0.05)
        self.assertEqual((rate, command), (0.0, 0))

    def test_pitch_commands_are_continuous_bounded_and_bidirectional(self):
        up = SmoothPitchActuator()
        up_commands = [up.command(8.0, 0.0, 0.05)[1] for _ in range(20)]
        self.assertTrue(all(0 < command <= 80 for command in up_commands))
        self.assertTrue(all(right - left <= 6
                            for left, right in zip(up_commands, up_commands[1:])))
        down = SmoothPitchActuator()
        self.assertLess(down.command(-8.0, 0.0, 0.05)[1], 0)

    def test_moving_pitch_target_does_not_repeatedly_reverse(self):
        self.source.update(self.observation)
        base = self.source.latest(self.t0)
        controller = ControllerV1(capture_cycles=1)
        measured_pitch = 0.0
        signs = []
        errors = []
        for index in range(240):
            target_pitch = 2.0 + 0.5 * index * 0.05
            target = replace(base, target_pitch_relative_deg=target_pitch,
                             target_pitch_rate_deg_s=0.5, vertical_valid=True)
            controller.correct_telemetry(0.0, measured_pitch, blend=1.0)
            output = controller.step(target, 0.05)
            measured_pitch += output.tilt_command * SmoothPitchActuator.DEG_S_PER_COMMAND * 0.05
            errors.append(output.pitch_error_deg)
            if output.tilt_command:
                signs.append(1 if output.tilt_command > 0 else -1)
        reversals = sum(left != right for left, right in zip(signs, signs[1:]))
        self.assertLessEqual(reversals, 1)
        self.assertLess(abs(errors[-1]), 0.2)


if __name__ == "__main__":
    unittest.main()
