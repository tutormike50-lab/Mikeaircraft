from pathlib import Path
import struct
import sys
import types
import unittest


SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"
sys.path.insert(0, str(SCRIPTS))

from production_tracker import (  # noqa: E402
    AdsbObservationIntake,
    AltitudePitchAcquisition,
    apply_pitch_acquisition,
    build_joystick_frame,
    clean_hex,
)
from production_tracking import CameraReference, ControllerV1, GeometryTargetSource  # noqa: E402

# Packet construction is pure, but the protected module imports the Pi-only
# BLE driver at module load time. Supply only the unused symbol for this test.
if "bleak" not in sys.modules:
    bleak = types.ModuleType("bleak")
    bleak.BleakClient = object
    sys.modules["bleak"] = bleak
from virtual_hill_tracker import packet as genuine_dji_packet  # noqa: E402


class LiveAltitudeTiltPathTests(unittest.TestCase):
    ICAO = "4400e3"
    SNAPSHOT_S = 2_000.0
    READ_MS = 2_000_000

    @staticmethod
    def record(**overrides):
        record = {
            "hex": LiveAltitudeTiltPathTests.ICAO,
            "flight": "EJU62BR ",
            "lat": 50.1000,
            "lon": 14.0500,
            "altitude": 2_000,
            "seen_pos": 0.1,
            "speed": 210,
            "track": 78,
            "vert_rate": 0,
        }
        record.update(overrides)
        return record

    def matched_record(self, feed):
        return next(item for item in feed["aircraft"]
                    if clean_hex(item.get("hex")) == self.ICAO)

    def test_selected_legacy_altitude_reaches_combined_pan_tilt_frame(self):
        feed = {"now": self.SNAPSHOT_S, "aircraft": [
            self.record(hex="abcdef", altitude=30_000),
            self.record(),
        ]}
        selected = self.matched_record(feed)

        self.assertIsInstance(selected["altitude"], (int, float))
        self.assertEqual(selected["altitude"], 2_000)  # pressure altitude, feet

        intake = AdsbObservationIntake()
        result = intake.ingest(feed, selected, self.ICAO, self.READ_MS)
        observation = result.observation
        self.assertIsNotNone(observation)
        self.assertAlmostEqual(observation.altitude_barometric_m, 609.6)
        self.assertEqual(
            observation.altitude_source,
            "DUMP1090_LEGACY_PRESSURE_ALTITUDE_APPROXIMATE",
        )

        source = GeometryTargetSource(
            CameraReference(50.0, 14.0, 360.0, 0.0, 0.0, 1),
            effective_latency_s=0.0,
        )
        self.assertTrue(source.update(observation))
        target = source.latest(self.READ_MS)
        self.assertTrue(target.vertical_valid)
        self.assertIsNotNone(target.target_elevation_deg)
        self.assertIsNotNone(target.target_pitch_relative_deg)

        horizontal = ControllerV1().step(target, 0.05)
        self.assertNotEqual(horizontal.pan_command, 0)
        pan_before = horizontal.pan_command
        pitch = AltitudePitchAcquisition().command_for(
            self.ICAO, target, 0, 0, 1.0, 1.0)
        self.assertEqual(pitch.command, 100)  # positive is physically proven UP
        combined = apply_pitch_acquisition(horizontal, pitch)
        self.assertEqual(combined.pan_command, pan_before)
        self.assertNotEqual(combined.tilt_command, 0)

        frame = build_joystick_frame(
            genuine_dji_packet, 0x1234, combined.tilt_command,
            combined.pan_command)
        self.assertEqual(len(frame), 22)
        tilt_channel, neutral_channel, pan_channel = struct.unpack("<hhh", frame[11:17])
        self.assertEqual(tilt_channel, 1024 + combined.tilt_command)
        self.assertEqual(neutral_channel, 1024)
        self.assertEqual(pan_channel, 1024 + combined.pan_command)

    def test_missing_altitude_is_zero_tilt_then_later_altitude_recovers(self):
        source = GeometryTargetSource(
            CameraReference(50.0, 14.0, 360.0, 0.0, 0.0, 1),
            effective_latency_s=0.0,
        )
        intake = AdsbObservationIntake()
        acquire = AltitudePitchAcquisition()

        missing_feed = {"now": self.SNAPSHOT_S, "aircraft": [
            self.record(altitude=None),
        ]}
        missing = intake.ingest(
            missing_feed, self.matched_record(missing_feed), self.ICAO,
            self.READ_MS).observation
        self.assertEqual(missing.altitude_source, "UNAVAILABLE")
        self.assertTrue(source.update(missing))
        missing_target = source.latest(self.READ_MS)
        self.assertFalse(missing_target.vertical_valid)
        safe = acquire.command_for(
            self.ICAO, missing_target, 0, 0, 1.0, 1.0)
        self.assertEqual((safe.command, safe.state, safe.reason),
                         (0, "READY", "TARGET_INVALID"))

        complete_feed = {"now": self.SNAPSHOT_S + 1.0, "aircraft": [
            self.record(seen_pos=0.1),
        ]}
        complete = intake.ingest(
            complete_feed, self.matched_record(complete_feed), self.ICAO,
            self.READ_MS + 1_000).observation
        self.assertTrue(source.update(complete))
        recovered_target = source.latest(self.READ_MS + 1_000)
        recovered = acquire.command_for(
            self.ICAO, recovered_target, 0, 0, 1.1, 1.1)
        self.assertTrue(recovered_target.vertical_valid)
        self.assertNotEqual(recovered.command, 0)


if __name__ == "__main__":
    unittest.main()
