from pathlib import Path
import sys
import unittest

SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"
sys.path.insert(0, str(SCRIPTS))

from production_tracker import AltitudePitchAcquisition, PitchAcquireDecision, apply_pitch_acquisition
from production_tracking import ControllerOutput, ControllerV1, GeometryTarget


def target(pitch, yaw=0.0, aircraft_id="abc123", status="VALID"):
    return GeometryTarget(
        1000, aircraft_id, 100.0, pitch, yaw, pitch, 0.0, -0.1,
        900, 1100, 100, 200, 5000.0, 5100.0,
        "ADS_B", "ADS_B_GEOMETRIC", "ADS_B_GROUND_VECTOR",
        True, True, status
    )


class DirectTiltHandoffTests(unittest.TestCase):
    def test_initial_pitch_acquisition_still_owns_tilt(self):
        acq = AltitudePitchAcquisition()
        d = acq.command_for("abc123", target(3.0), 0, 0, 10.0, 10.0)
        self.assertTrue(d.owns_tilt)
        self.assertEqual(d.state, "ACQUIRE")
        self.assertEqual(d.command, 100)

    def test_acquired_on_target_releases_normal_controller_tilt(self):
        acq = AltitudePitchAcquisition()
        acq.selected_id = "abc123"
        acq.state = "ACQUIRED"
        acq.final_reason = "ON_TARGET"
        d = acq.command_for("abc123", target(0.8), 0, 0, 10.0, 10.0)
        base = ControllerOutput("TRACK", 0.2, 0.8, 1.0, -0.1, 44, 25)
        out = apply_pitch_acquisition(base, d)
        self.assertFalse(d.owns_tilt)
        self.assertIs(out, base)
        self.assertEqual(out.tilt_command, 25)

    def test_descending_target_keeps_normal_ongoing_tilt(self):
        controller = ControllerV1()
        controller.aircraft_id = "abc123"
        controller.mode = "TRACK"
        descending = target(-0.8)
        base = controller.step(descending, 0.05)
        self.assertLess(base.tilt_command, 0)

        acq = AltitudePitchAcquisition()
        acq.selected_id = "abc123"
        acq.state = "ACQUIRED"
        acq.final_reason = "ON_TARGET"
        d = acq.command_for("abc123", descending, 0, 0, 10.0, 10.0)
        out = apply_pitch_acquisition(base, d)
        self.assertFalse(d.owns_tilt)
        self.assertEqual(out.tilt_command, base.tilt_command)
        self.assertLess(out.tilt_command, 0)

    def test_recovery_reacquires_tilt_when_error_exceeds_threshold(self):
        acq = AltitudePitchAcquisition()
        acq.selected_id = "abc123"
        acq.state = "ACQUIRED"
        acq.final_reason = "ON_TARGET"
        d = acq.command_for("abc123", target(2.0), 0, 0, 10.0, 10.0)
        self.assertTrue(d.owns_tilt)
        self.assertEqual(d.command, 100)
        base = ControllerOutput("TRACK", 0.3, 2.0, 1.0, 0.0, 51, 35)
        out = apply_pitch_acquisition(base, d)
        self.assertEqual(out.tilt_command, 100)
        self.assertEqual(out.pan_command, 51)

    def test_pan_is_unchanged_in_both_authority_states(self):
        base = ControllerOutput("TRACK", 1.0, 1.0, 2.0, 0.0, 77, 35)
        owned = apply_pitch_acquisition(base, PitchAcquireDecision(100, owns_tilt=True))
        released = apply_pitch_acquisition(base, PitchAcquireDecision(0, state="ACQUIRED",
                                                                       reason="ON_TARGET",
                                                                       owns_tilt=False))
        self.assertEqual(owned.pan_command, 77)
        self.assertEqual(released.pan_command, 77)
        self.assertEqual(released.tilt_command, 35)

    def test_home_controller_behaviour_is_unchanged(self):
        controller = ControllerV1()
        controller.estimated_yaw_deg = 0.0
        controller.estimated_pitch_deg = 0.0
        home = GeometryTarget(
            1000, None, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0,
            None, 1000, None, None, None, None,
            "CAMERA_REFERENCE", "CAMERA_REFERENCE", None,
            True, True, "HOME"
        )
        out = controller.step(home, 0.05)
        self.assertEqual(out.pan_command, 0)
        self.assertEqual(out.tilt_command, 0)
        self.assertEqual(out.state, "HOLD_HOME")


if __name__ == "__main__":
    unittest.main()
