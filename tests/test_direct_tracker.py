import pathlib
import sys
import unittest
from unittest.mock import patch

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from production_tracker import direct_selection  # noqa: E402


class DirectSelectionTests(unittest.TestCase):
    @patch("production_tracker.read_json_url")
    def test_only_explicit_tracking_icao_is_selected(self, read):
        read.return_value = {"command": "TRACKING", "aircraftId": "AbC123", "callsign": "TEST1"}
        self.assertEqual(direct_selection("https://example.test", "pin")["aircraft_id"], "abc123")
        read.return_value = {"command": "HOME", "aircraftId": "abc123"}
        self.assertIsNone(direct_selection("https://example.test", "pin"))
        read.return_value = {"command": "STOPPED", "aircraftId": "abc123"}
        self.assertIsNone(direct_selection("https://example.test", "pin"))


if __name__ == "__main__":
    unittest.main()
