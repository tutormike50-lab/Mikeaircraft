from pathlib import Path
from dataclasses import replace
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from camera_optics import (angular_tolerance_deg, camera_optics, fov_deg,
                           normalized_frame_offset, W16_9_MM, H16_9_MM)  # noqa: E402
from production_tracking import (AircraftObservation, CameraReference, ControllerV1,
                                 GeometryTargetSource)  # noqa: E402
from production_tracker import Diagnostics  # noqa: E402
from types import SimpleNamespace
import json
import tempfile


class CameraOpticsTests(unittest.TestCase):
    def test_representative_standard_fov_regression(self):
        expected = [(30.5, 63.45, 38.35), (50, 41.32, 23.95), (100, 21.36, 12.11),
                    (200, 10.77, 6.07), (300, 7.19, 4.05), (400, 5.40, 3.04),
                    (500, 4.32, 2.43), (600, 3.60, 2.03), (627, 3.44, 1.94)]
        for focal, horizontal, vertical in expected:
            self.assertAlmostEqual(fov_deg(W16_9_MM, focal), horizontal, delta=.06)
            self.assertAlmostEqual(fov_deg(H16_9_MM, focal), vertical, delta=.06)

    def test_frame_offset_sign_edges_and_zoom_tolerances(self):
        optics = camera_optics(1.0)
        half_h = optics.horizontal_fov_deg / 2
        self.assertAlmostEqual(normalized_frame_offset(0, optics.horizontal_fov_deg), 0)
        self.assertAlmostEqual(normalized_frame_offset(half_h, optics.horizontal_fov_deg), .5)
        self.assertAlmostEqual(normalized_frame_offset(-half_h, optics.horizontal_fov_deg), -.5)
        self.assertLess(angular_tolerance_deg(.10, optics.horizontal_fov_deg),
                        angular_tolerance_deg(.25, optics.horizontal_fov_deg))
        self.assertLess(angular_tolerance_deg(.25, optics.vertical_fov_deg),
                        angular_tolerance_deg(.25, optics.horizontal_fov_deg))

    def test_invalid_frame_diagnostic_inputs_are_nullable(self):
        for value in (None, float("nan"), float("inf"), "missing"):
            self.assertIsNone(normalized_frame_offset(value, 3.6))
        for value in (None, float("nan"), float("inf"), 0, -1, 180):
            self.assertIsNone(normalized_frame_offset(1.0, value))
            self.assertIsNone(angular_tolerance_deg(.25, value))

    def test_valid_600mm_frame_diagnostic_regression(self):
        horizontal_fov = fov_deg(W16_9_MM, 600)
        self.assertAlmostEqual(horizontal_fov, 3.6, delta=.01)
        self.assertAlmostEqual(normalized_frame_offset(horizontal_fov / 2, horizontal_fov), .5)
        self.assertIsNotNone(angular_tolerance_deg(.25, horizontal_fov))

    def test_fresh_default_optics_is_valid_before_slider_input(self):
        optics = camera_optics()
        self.assertEqual(optics.slider_position_0_1, 0.0)
        self.assertEqual(optics.stabilisation_mode, "STANDARD_OR_OFF")
        self.assertTrue(optics.optics_valid)
        self.assertGreater(optics.horizontal_fov_deg, 0)

    def test_optics_cannot_change_aircraft_geometry(self):
        source = GeometryTargetSource(CameraReference(50, 14, 300, 0, 0, 1))
        source.update(AircraftObservation("abc123", 2_000_000, 50.045, 14.01, 1300, 200, 90, 0))
        before = source.latest(2_000_100)
        camera_optics(0.0)
        camera_optics(1.0, "DYNAMIC")
        after = source.latest(2_000_100)
        self.assertEqual(before.target_true_azimuth_deg, after.target_true_azimuth_deg)
        self.assertEqual(before.target_elevation_deg, after.target_elevation_deg)
        self.assertEqual(before.prediction_age_ms, after.prediction_age_ms)

    def test_diagnostics_are_correlated_without_claiming_a_visual_measurement(self):
        source = GeometryTargetSource(CameraReference(50, 14, 300, 0, 0, 1))
        source.update(AircraftObservation("abc123", 2_000_000, 50.045, 14.01, 1300, 200, 90, 0))
        target = source.latest(2_000_100)
        output = SimpleNamespace(yaw_error_deg=1.0, pitch_error_deg=-.5, state="TRACK",
                                 requested_yaw_rate_deg_s=0, requested_pitch_rate_deg_s=0,
                                 pan_command=0, tilt_command=0)
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "diagnostics.jsonl"
            diagnostics = Diagnostics(path)
            diagnostics.write(target, output, {}, "DISCONNECTED", camera_optics(.5))
            diagnostics.close()
            row = json.loads(path.read_text(encoding="utf-8"))
        self.assertIn("slider_position", row)
        self.assertIn("equivalent_focal_length_mm", row)
        self.assertIn("source_age_ms", row)
        self.assertIn("prediction_age_ms", row)
        self.assertIn("predicted_controller_residual_frame_x_n_not_observed", row)
        self.assertNotIn("aircraft_centroid_x_px", row)

    def test_missing_altitude_pitch_error_cannot_crash_diagnostics(self):
        source = GeometryTargetSource(CameraReference(50, 14, 300, 0, 0, 1))
        source.update(AircraftObservation("49d5d6", 2_000_000, 50.045, 14.01, None,
                                          200, 90, None,
                                          altitude_source="UNAVAILABLE_BAROMETRIC_NOT_SUBSTITUTED"))
        target = source.latest(2_000_100)
        output = ControllerV1().step(target, .05)
        self.assertIsNone(output.pitch_error_deg)
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "diagnostics.jsonl"
            diagnostics = Diagnostics(path)
            diagnostics.write(target, output, {}, "CONNECTED", camera_optics())
            diagnostics.close()
            row = json.loads(path.read_text(encoding="utf-8"))
        self.assertIsNone(row["predicted_controller_residual_frame_y_n_not_observed"])
        self.assertFalse(row["optics_diagnostics_valid"])
        self.assertEqual(row["optics_diagnostics_error"], "invalid: frame_y")

    def test_invalid_fov_cannot_crash_production_diagnostics(self):
        source = GeometryTargetSource(CameraReference(50, 14, 300, 0, 0, 1))
        source.update(AircraftObservation("49d5d6", 2_000_000, 50.045, 14.01, 1300,
                                          200, 90, 0))
        target = source.latest(2_000_100)
        output = ControllerV1().step(target, .05)
        for invalid_fov in (None, float("nan"), float("inf"), 0):
            with self.subTest(fov=invalid_fov), tempfile.TemporaryDirectory() as directory:
                optics = replace(camera_optics(), horizontal_fov_deg=invalid_fov,
                                 vertical_fov_deg=invalid_fov, optics_valid=False)
                path = Path(directory) / "diagnostics.jsonl"
                diagnostics = Diagnostics(path)
                diagnostics.write(target, output, {}, "CONNECTED", optics)
                diagnostics.close()
                row = json.loads(path.read_text(encoding="utf-8"))
                self.assertFalse(row["optics_diagnostics_valid"])
                self.assertIsNone(row["predicted_controller_residual_frame_x_n_not_observed"])
                self.assertIsNone(row["acquire_yaw_tolerance_deg"])


if __name__ == "__main__":
    unittest.main()
