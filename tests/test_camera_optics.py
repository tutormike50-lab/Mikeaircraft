from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from camera_optics import (angular_tolerance_deg, camera_optics, fov_deg,
                           normalized_frame_offset, W16_9_MM, H16_9_MM)  # noqa: E402
from production_tracking import AircraftObservation, CameraReference, GeometryTargetSource  # noqa: E402
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


if __name__ == "__main__":
    unittest.main()
