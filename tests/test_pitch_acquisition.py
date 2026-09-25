import importlib.util
from pathlib import Path
import sys
import types
import unittest
from unittest import mock


SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"
sys.path.insert(0, str(SCRIPTS))

from production_tracker import (  # noqa: E402
    PITCH_ACQUIRE_COMMAND,
    OneShotPitchAcquisition,
    physical_pitch_relative_deg,
    rs4_tilt_command,
)
from production_tracking import ControllerV1, GeometryTarget  # noqa: E402


def packet(seq, tilt, pan):
    spec = importlib.util.spec_from_file_location(
        "_pitch_packet_fixture", SCRIPTS / "virtual_hill_tracker.py")
    module = importlib.util.module_from_spec(spec)
    with mock.patch.dict(sys.modules, {"bleak": types.SimpleNamespace(BleakClient=object)}):
        spec.loader.exec_module(module)
    return module.packet(seq, tilt, pan)


def target(pitch_deg):
    return GeometryTarget(
        timestamp_ms=0, aircraft_id="abc123", target_true_azimuth_deg=0.0,
        target_elevation_deg=pitch_deg, target_yaw_relative_deg=0.0,
        target_pitch_relative_deg=pitch_deg, target_yaw_rate_deg_s=0.0,
        target_pitch_rate_deg_s=0.0, aircraft_state_timestamp_ms=0,
        aim_timestamp_ms=0, source_age_ms=0, prediction_age_ms=0,
        horizontal_range_m=1000.0, slant_range_m=1000.0,
        position_source="TEST", altitude_source="TEST", velocity_source="TEST",
        horizontal_valid=True, vertical_valid=True, status="VALID")


class OneShotPitchAcquisitionTests(unittest.TestCase):
    def test_one_bounded_opposite_direction_pulse_then_zero(self):
        pulse = OneShotPitchAcquisition(duration_s=0.50, command_budget=10)
        decisions = [pulse.command_for("abc123", "VALID", index * 0.05)
                     for index in range(11)]

        self.assertEqual(PITCH_ACQUIRE_COMMAND, 25)
        self.assertEqual([decision.command for decision in decisions], [25] * 10 + [0])
        self.assertEqual(decisions[0].event["name"], "PITCH_ACQUIRE_START")
        self.assertEqual(decisions[-1].event["name"], "PITCH_ACQUIRE_DONE")
        self.assertEqual(decisions[-1].event["commands_sent"], 10)
        self.assertEqual(decisions[-1].event["completion"], "BUDGET_COMPLETE")

    def test_same_icao_cannot_rearm_after_polling_or_reacquisition(self):
        pulse = OneShotPitchAcquisition(duration_s=1.0, command_budget=1)
        self.assertEqual(pulse.command_for("abc123", "VALID", 0.0).command, 25)
        self.assertEqual(pulse.command_for("abc123", "VALID", 0.05).command, 0)
        self.assertEqual(pulse.command_for(None, "HOME", 0.10).command, 0)
        self.assertEqual(pulse.command_for("abc123", "VALID", 0.15).command, 0)

    def test_new_icao_can_pulse_once(self):
        pulse = OneShotPitchAcquisition(command_budget=1)
        pulse.command_for("abc123", "VALID", 0.0)
        pulse.command_for("abc123", "VALID", 0.1)
        self.assertEqual(pulse.command_for("def456", "VALID", 0.2).command, 25)

    def test_selection_change_forces_zero_before_new_icao_pulse(self):
        pulse = OneShotPitchAcquisition()
        self.assertEqual(pulse.command_for("abc123", "VALID", 0.0).command, 25)
        stopped = pulse.command_for("def456", "VALID", 0.05)
        self.assertEqual(stopped.command, 0)
        self.assertEqual(stopped.event["completion"], "SELECTION_CHANGED")
        self.assertEqual(pulse.command_for("def456", "VALID", 0.1).command, 25)

    def test_home_stale_invalid_and_missing_selection_always_zero(self):
        for aircraft_id, status in ((None, "HOME"), ("abc123", "STALE"),
                                    ("def456", "INVALID")):
            pulse = OneShotPitchAcquisition()
            self.assertEqual(pulse.command_for(aircraft_id, status, 0.0).command, 0)

    def test_invalid_transition_stops_active_pulse_and_never_rearms(self):
        pulse = OneShotPitchAcquisition()
        self.assertEqual(pulse.command_for("abc123", "VALID", 0.0).command, 25)
        stopped = pulse.command_for("abc123", "STALE", 0.05)
        self.assertEqual(stopped.command, 0)
        self.assertEqual(stopped.event["name"], "PITCH_ACQUIRE_DONE")
        self.assertEqual(stopped.event["completion"], "TARGET_STALE")
        self.assertEqual(pulse.command_for("abc123", "VALID", 0.1).command, 0)


class PitchSignPathTests(unittest.TestCase):
    def test_raw_telemetry_is_normalized_to_physical_pitch(self):
        self.assertEqual(physical_pitch_relative_deg(8.0, 10.0), 2.0)
        self.assertEqual(physical_pitch_relative_deg(12.0, 10.0), -2.0)
        self.assertEqual(physical_pitch_relative_deg(10.0, 10.0), 0.0)

    def test_logical_pitch_uses_one_opposite_hardware_conversion(self):
        self.assertEqual(rs4_tilt_command(25), -25)
        self.assertEqual(rs4_tilt_command(-25), 25)
        self.assertEqual(rs4_tilt_command(0), 0)

    def test_controller_up_demand_reaches_up_hardware_value(self):
        controller = ControllerV1()
        controller.reset_target("abc123")
        output = controller.step(target(2.0), 0.05)
        self.assertGreater(output.tilt_command, 0)
        self.assertLess(rs4_tilt_command(output.tilt_command), 0)

    def test_packet_keeps_tilt_and_pan_in_distinct_signed_int16_fields(self):
        import struct

        encoded = packet(0x1234, rs4_tilt_command(25), 7)
        tilt_field, roll_field, pan_field = struct.unpack_from("<hhh", encoded, 11)
        self.assertEqual((tilt_field, roll_field, pan_field), (999, 1024, 1031))


if __name__ == "__main__":
    unittest.main()
