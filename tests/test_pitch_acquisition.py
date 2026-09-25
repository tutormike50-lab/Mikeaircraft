from pathlib import Path
import sys
import unittest


SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"
sys.path.insert(0, str(SCRIPTS))

from production_tracker import (PITCH_ACQUIRE_COMMAND, OneShotPitchAcquisition)  # noqa: E402


class OneShotPitchAcquisitionTests(unittest.TestCase):
    def test_one_bounded_opposite_direction_pulse_then_zero(self):
        pulse = OneShotPitchAcquisition(duration_s=0.50, command_budget=10)
        decisions = [pulse.command_for("abc123", "VALID", index * 0.05)
                     for index in range(11)]

        self.assertEqual(PITCH_ACQUIRE_COMMAND, -25)
        self.assertEqual([decision.command for decision in decisions], [-25] * 10 + [0])
        self.assertEqual(decisions[0].event["name"], "PITCH_ACQUIRE_START")
        self.assertEqual(decisions[-1].event["name"], "PITCH_ACQUIRE_DONE")
        self.assertEqual(decisions[-1].event["commands_sent"], 10)
        self.assertEqual(decisions[-1].event["completion"], "BUDGET_COMPLETE")

    def test_same_icao_cannot_rearm_after_polling_or_reacquisition(self):
        pulse = OneShotPitchAcquisition(duration_s=1.0, command_budget=1)
        self.assertEqual(pulse.command_for("abc123", "VALID", 0.0).command, -25)
        self.assertEqual(pulse.command_for("abc123", "VALID", 0.05).command, 0)
        self.assertEqual(pulse.command_for(None, "HOME", 0.10).command, 0)
        self.assertEqual(pulse.command_for("abc123", "VALID", 0.15).command, 0)

    def test_new_icao_can_pulse_once(self):
        pulse = OneShotPitchAcquisition(command_budget=1)
        pulse.command_for("abc123", "VALID", 0.0)
        pulse.command_for("abc123", "VALID", 0.1)
        self.assertEqual(pulse.command_for("def456", "VALID", 0.2).command, -25)

    def test_selection_change_forces_zero_before_new_icao_pulse(self):
        pulse = OneShotPitchAcquisition()
        self.assertEqual(pulse.command_for("abc123", "VALID", 0.0).command, -25)
        stopped = pulse.command_for("def456", "VALID", 0.05)
        self.assertEqual(stopped.command, 0)
        self.assertEqual(stopped.event["completion"], "SELECTION_CHANGED")
        self.assertEqual(pulse.command_for("def456", "VALID", 0.1).command, -25)

    def test_home_stale_invalid_and_missing_selection_always_zero(self):
        for aircraft_id, status in ((None, "HOME"), ("abc123", "STALE"),
                                    ("def456", "INVALID")):
            pulse = OneShotPitchAcquisition()
            self.assertEqual(pulse.command_for(aircraft_id, status, 0.0).command, 0)

    def test_invalid_transition_stops_active_pulse_and_never_rearms(self):
        pulse = OneShotPitchAcquisition()
        self.assertEqual(pulse.command_for("abc123", "VALID", 0.0).command, -25)
        stopped = pulse.command_for("abc123", "STALE", 0.05)
        self.assertEqual(stopped.command, 0)
        self.assertEqual(stopped.event["name"], "PITCH_ACQUIRE_DONE")
        self.assertEqual(stopped.event["completion"], "TARGET_STALE")
        self.assertEqual(pulse.command_for("abc123", "VALID", 0.1).command, 0)


if __name__ == "__main__":
    unittest.main()
