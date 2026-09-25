from pathlib import Path
import sys
import unittest


SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"
sys.path.insert(0, str(SCRIPTS))

from production_tracker import (PITCH_ACQUIRE_COMMAND, OneShotPitchAcquisition,
                                PitchAcquireDecision, apply_pitch_acquisition,
                                build_joystick_frame)  # noqa: E402
from production_tracking import ControllerOutput  # noqa: E402


class OneShotPitchAcquisitionTests(unittest.TestCase):
    def test_one_bounded_opposite_direction_pulse_then_zero(self):
        pulse = OneShotPitchAcquisition(duration_s=2.0, command_budget=40)
        decisions = [pulse.command_for("abc123", "VALID", index * 0.05)
                     for index in range(41)]

        self.assertEqual(PITCH_ACQUIRE_COMMAND, 100)
        self.assertEqual([decision.command for decision in decisions], [100] * 40 + [0])
        self.assertEqual(decisions[0].event["name"], "PITCH_ACQUIRE_START")
        self.assertEqual(decisions[-1].event["name"], "PITCH_ACQUIRE_DONE")
        self.assertEqual(decisions[-1].event["commands_sent"], 40)
        self.assertEqual(decisions[-1].event["completion"], "BUDGET_COMPLETE")

    def test_same_icao_cannot_rearm_after_polling_or_reacquisition(self):
        pulse = OneShotPitchAcquisition(duration_s=1.0, command_budget=1)
        self.assertEqual(pulse.command_for("abc123", "VALID", 0.0).command, 100)
        self.assertEqual(pulse.command_for("abc123", "VALID", 0.05).command, 0)
        self.assertEqual(pulse.command_for(None, "HOME", 0.10).command, 0)
        self.assertEqual(pulse.command_for("abc123", "VALID", 0.15).command, 0)

    def test_new_icao_can_pulse_once(self):
        pulse = OneShotPitchAcquisition(command_budget=1)
        pulse.command_for("abc123", "VALID", 0.0)
        pulse.command_for("abc123", "VALID", 0.1)
        self.assertEqual(pulse.command_for("def456", "VALID", 0.2).command, 100)

    def test_selection_change_forces_zero_before_new_icao_pulse(self):
        pulse = OneShotPitchAcquisition()
        self.assertEqual(pulse.command_for("abc123", "VALID", 0.0).command, 100)
        stopped = pulse.command_for("def456", "VALID", 0.05)
        self.assertEqual(stopped.command, 0)
        self.assertEqual(stopped.event["completion"], "SELECTION_CHANGED")
        self.assertEqual(pulse.command_for("def456", "VALID", 0.1).command, 100)

    def test_home_stale_invalid_and_missing_selection_always_zero(self):
        for aircraft_id, status in ((None, "HOME"), ("abc123", "STALE"),
                                    ("def456", "INVALID")):
            pulse = OneShotPitchAcquisition()
            self.assertEqual(pulse.command_for(aircraft_id, status, 0.0).command, 0)

    def test_invalid_transition_stops_active_pulse_and_never_rearms(self):
        pulse = OneShotPitchAcquisition()
        self.assertEqual(pulse.command_for("abc123", "VALID", 0.0).command, 100)
        stopped = pulse.command_for("abc123", "STALE", 0.05)
        self.assertEqual(stopped.command, 0)
        self.assertEqual(stopped.event["name"], "PITCH_ACQUIRE_DONE")
        self.assertEqual(stopped.event["completion"], "TARGET_STALE")
        self.assertEqual(pulse.command_for("abc123", "VALID", 0.1).command, 0)

    def test_pan_output_is_numerically_identical_with_tilt_zero_and_during_pulse(self):
        baseline = ControllerOutput("TRACK", 3.5, -1.25, 2.0, -1.0, -73, 18)
        zero = apply_pitch_acquisition(baseline, PitchAcquireDecision(0))
        pulse = apply_pitch_acquisition(baseline, PitchAcquireDecision(100))
        self.assertEqual(zero.pan_command, baseline.pan_command)
        self.assertEqual(pulse.pan_command, baseline.pan_command)
        self.assertEqual(zero.tilt_command, 0)
        self.assertEqual(pulse.tilt_command, 100)

    def test_combined_joystick_frame_retains_pan_then_pan_continues(self):
        calls = []

        def proven_packet(sequence, tilt, pan):
            calls.append((sequence, tilt, pan))
            return b"frame"

        self.assertEqual(build_joystick_frame(proven_packet, 0x1234, 100, -73), b"frame")
        self.assertEqual(build_joystick_frame(proven_packet, 0x1235, 0, -73), b"frame")
        self.assertEqual(calls, [(0x1234, 100, -73), (0x1235, 0, -73)])

    def test_duration_above_hard_limit_is_rejected(self):
        with self.assertRaises(ValueError):
            OneShotPitchAcquisition(duration_s=2.01)


if __name__ == "__main__":
    unittest.main()
