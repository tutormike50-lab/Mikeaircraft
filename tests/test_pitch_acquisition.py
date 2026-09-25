from pathlib import Path
from types import SimpleNamespace
import sys
import unittest


SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"
sys.path.insert(0, str(SCRIPTS))

from production_tracker import (AltitudePitchAcquisition, PitchAcquireDecision,
                                apply_pitch_acquisition,
                                build_joystick_frame)  # noqa: E402
from production_tracking import ControllerOutput  # noqa: E402


def target(pitch, status="VALID", vertical_valid=True):
    return SimpleNamespace(target_pitch_relative_deg=pitch, status=status,
                           vertical_valid=vertical_valid)


class AltitudePitchAcquisitionTests(unittest.TestCase):
    def test_physical_pitch_wraps_across_positive_to_negative_boundary(self):
        self.assertAlmostEqual(
            AltitudePitchAcquisition.physical_pitch(1797, -1787), -1.6)

    def test_physical_pitch_wraps_across_negative_to_positive_boundary(self):
        self.assertAlmostEqual(
            AltitudePitchAcquisition.physical_pitch(-1787, 1797), 1.6)

    def test_physical_pitch_non_wrap_cases_are_unchanged(self):
        self.assertEqual(AltitudePitchAcquisition.physical_pitch(1780, 1730), 5.0)
        self.assertEqual(AltitudePitchAcquisition.physical_pitch(1730, 1780), -5.0)
        self.assertEqual(AltitudePitchAcquisition.physical_pitch(0, 0), 0.0)

    def test_physical_pitch_sign_and_direct_target_contract(self):
        acquire = AltitudePitchAcquisition()
        decision = acquire.command_for("abc123", target(6.0), 1780, 1730, 1.0, 1.0)
        self.assertEqual(decision.physical_pitch_deg, 5.0)
        self.assertEqual(decision.error_deg, 1.0)
        self.assertEqual(decision.command, 0)
        self.assertEqual(decision.state, "ACQUIRED")
        self.assertEqual(decision.reason, "ON_TARGET")

    def test_pulse_schedule_and_both_physical_directions(self):
        cases = ((6.0, 100, .40), (3.0, 100, .20), (1.25, 100, .10),
                 (-6.0, -100, .40), (-3.0, -100, .20), (-1.25, -100, .10))
        for desired, command, duration in cases:
            with self.subTest(desired=desired):
                decision = AltitudePitchAcquisition().command_for(
                    "abc123", target(desired), 1780, 1780, 1.0, 1.0)
                self.assertEqual(decision.command, command)
                self.assertEqual(decision.pulse_duration_s, duration)

    def test_pulse_stops_then_waits_for_strictly_fresh_telemetry(self):
        acquire = AltitudePitchAcquisition()
        first = acquire.command_for("abc123", target(6.0), 1780, 1780, 1.0, 1.0)
        self.assertEqual(first.command, 100)
        self.assertEqual(acquire.command_for(
            "abc123", target(6.0), 1780, 1780, 1.0, 1.39).command, 100)
        stopped = acquire.command_for("abc123", target(6.0), 1780, 1760, 1.0, 1.40)
        self.assertEqual(stopped.command, 0)
        self.assertEqual(acquire.state, "WAIT_TELEMETRY")
        still_waiting = acquire.command_for(
            "abc123", target(6.0), 1780, 1760, 1.0, 1.41)
        self.assertEqual(still_waiting.command, 0)
        fresh = acquire.command_for("abc123", target(6.0), 1780, 1760, 1.42, 1.42)
        self.assertEqual(fresh.command, 100)
        self.assertEqual(fresh.pulse_duration_s, .20)

    def test_acquired_does_not_hunt_or_follow_changed_pitch_target(self):
        acquire = AltitudePitchAcquisition()
        self.assertEqual(acquire.command_for(
            "abc123", target(1.0), 1780, 1780, 1.0, 1.0).state, "ACQUIRED")
        after_change = acquire.command_for(
            "abc123", target(8.0), 1780, 1780, 1.1, 1.1)
        self.assertEqual(after_change.command, 0)
        self.assertEqual(after_change.state, "ACQUIRED")

    def test_same_icao_polling_does_not_reset_but_new_selection_does(self):
        acquire = AltitudePitchAcquisition()
        acquire.command_for("abc123", target(6.0), 1780, 1780, 1.0, 1.0)
        self.assertEqual(acquire.command_for(
            "abc123", target(6.0), 1780, 1780, 1.1, 1.1).command, 100)
        changed = acquire.command_for("def456", target(6.0), 1780, 1780, 1.2, 1.2)
        self.assertEqual(changed.command, 0)
        self.assertEqual(changed.reason, "TARGET_CHANGED")
        self.assertEqual(acquire.command_for(
            "def456", target(6.0), 1780, 1780, 1.3, 1.3).command, 100)

    def test_target_and_measured_fences_abort_without_clamping(self):
        outside = AltitudePitchAcquisition().command_for(
            "abc123", target(12.01), 1780, 1780, 1.0, 1.0)
        self.assertEqual((outside.command, outside.state, outside.reason),
                         (0, "ABORT", "TARGET_OUTSIDE_PITCH_FENCE"))
        measured = AltitudePitchAcquisition().command_for(
            "abc123", target(5.0), 1780, 1660, 1.0, 1.0)
        self.assertEqual((measured.command, measured.reason), (0, "FENCE"))

    def test_invalid_stale_timeout_and_cumulative_budget_abort(self):
        invalid = AltitudePitchAcquisition().command_for(
            "abc123", target(None, vertical_valid=False), 1780, 1780, 1.0, 1.0)
        self.assertEqual(invalid.reason, "TARGET_INVALID")
        stale = AltitudePitchAcquisition().command_for(
            "abc123", target(5.0), 1780, 1780, 1.0, 3.51)
        self.assertEqual(stale.reason, "STALE_TELEMETRY")
        timeout = AltitudePitchAcquisition(timeout_s=.1)
        timeout.command_for("abc123", target(5.0), 1780, 1780, 1.0, 1.0)
        self.assertEqual(timeout.command_for(
            "abc123", target(5.0), 1780, 1780, 1.2, 1.2).reason, "TIMEOUT")
        budget = AltitudePitchAcquisition(cumulative_limit_s=.39)
        self.assertEqual(budget.command_for(
            "abc123", target(5.0), 1780, 1780, 1.0, 1.0).reason, "TIMEOUT")

    def test_pan_output_is_identical_during_pulse_and_neutral(self):
        baseline = ControllerOutput("TRACK", 3.5, -1.25, 2.0, -1.0, -73, 18)
        for command in (100, -100, 0):
            result = apply_pitch_acquisition(baseline, PitchAcquireDecision(command))
            self.assertEqual(result.pan_command, baseline.pan_command)
            self.assertEqual(result.tilt_command, command)

    def test_combined_joystick_frame_retains_live_pan(self):
        calls = []

        def proven_packet(sequence, tilt, pan):
            calls.append((sequence, tilt, pan))
            return b"frame"

        for sequence, tilt, pan in ((1, 100, -73), (2, 0, -68), (3, -100, -61)):
            self.assertEqual(build_joystick_frame(
                proven_packet, sequence, tilt, pan), b"frame")
        self.assertEqual(calls, [(1, 100, -73), (2, 0, -68), (3, -100, -61)])


if __name__ == "__main__":
    unittest.main()
