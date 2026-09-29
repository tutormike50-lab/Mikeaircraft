import importlib.util
import io
from pathlib import Path
import tempfile
import unittest
from unittest import mock
import urllib.error

MODULE_PATH = Path(__file__).parents[1] / "scripts" / "pi_bridge.py"
SPEC = importlib.util.spec_from_file_location("pi_bridge", MODULE_PATH)
pi_bridge = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(pi_bridge)



class V2ReleaseIdentityTests(unittest.TestCase):
    def test_bridge_release_marker_follows_runtime_root(self):
        source = (Path(__file__).resolve().parents[1] / "scripts" / "pi_bridge.py").read_text()
        self.assertIn("ReleaseManager(self.repo_dir, self.repo_dir)", source)


class FakeInput:
    def __init__(self): self.value = ""
    def write(self, value): self.value += value
    def flush(self): pass
    def close(self): pass


class FakeProcess:
    def __init__(self, code=None):
        self.pid = 4321
        self.stdin = FakeInput()
        self.code = code
        self.waits = []
    def poll(self): return self.code
    def wait(self, timeout): self.waits.append(timeout); self.code = 0; return 0


class PiBridgeTests(unittest.TestCase):
    def make_bridge(self, popen):
        root = tempfile.TemporaryDirectory()
        self.addCleanup(root.cleanup)
        path = Path(root.name)
        (path / "scripts").mkdir()
        (path / "scripts" / "production_tracker.py").write_text("", encoding="utf-8")
        return pi_bridge.PiBridge("https://example.test", "secret", "pin", path, path / "logs", popen=popen), path

    def test_start_is_idempotent_and_only_launches_production_entrypoint(self):
        calls = []
        def popen(command, **kwargs):
            calls.append((command, kwargs)); return FakeProcess()
        bridge, path = self.make_bridge(popen)
        bridge.start(7); bridge.start(7)
        self.assertEqual(len(calls), 1)
        self.assertEqual(calls[0][0][1], str(path / "scripts" / "production_tracker.py"))
        self.assertEqual(calls[0][0][2], "--track")
        self.assertEqual(bridge.process.stdin.value, "TRACK CURRENT\n")
        self.assertEqual(calls[0][1]["env"]["MIKEAIRCRAFT_CONTROL_PIN"], "pin")
        bridge._close_output()

    def test_check_auth_reports_fingerprint_without_secret(self):
        token = "super-secret-value"
        response = mock.MagicMock()
        response.status = 200
        response.read.return_value = ('{"tokenFingerprint":"' + pi_bridge.token_fingerprint(token) + '"}').encode()
        response.__enter__.return_value = response
        output = io.StringIO()
        with mock.patch("sys.stdout", output):
            result = pi_bridge.check_auth("https://example.test/", token, opener=lambda *args, **kwargs: response)
        self.assertEqual(result, 0)
        self.assertNotIn(token, output.getvalue())
        self.assertIn(pi_bridge.token_fingerprint(token), output.getvalue())
        self.assertIn("Control PIN is not used", output.getvalue())

    def test_check_auth_identifies_bridge_token_rejection(self):
        error = urllib.error.HTTPError("https://example.test/api/pi-bridge", 401, "Unauthorized", {}, None)
        output = io.StringIO()
        with mock.patch("sys.stdout", output):
            result = pi_bridge.check_auth("https://example.test", "secret", opener=mock.Mock(side_effect=error))
        self.assertEqual(result, 1)
        self.assertIn("bridge token rejected", output.getvalue())

    def test_stop_sends_sigint_and_waits_for_safe_cleanup(self):
        process = FakeProcess()
        bridge, _ = self.make_bridge(lambda *args, **kwargs: process)
        bridge.start(1)
        with mock.patch.object(pi_bridge.os, "killpg", create=True) as killpg:
            bridge.stop()
        killpg.assert_called_once_with(4321, pi_bridge.signal.SIGINT)
        self.assertEqual(process.waits, [pi_bridge.STOP_TIMEOUT_SECONDS])
        self.assertEqual(bridge.tracker_state, "STOPPED")

    def test_crash_latches_fault_and_does_not_restart_same_generation(self):
        calls = []
        process = FakeProcess()
        bridge, _ = self.make_bridge(lambda *args, **kwargs: calls.append(1) or process)
        bridge.start(3); process.code = 1; bridge.refresh_process(); bridge.start(3)
        self.assertEqual(bridge.tracker_state, "FAULT")
        self.assertIn("code 1", bridge.fault)
        self.assertEqual(len(calls), 1)
        bridge.reconcile({"desired": "STOPPED", "generation": 4})
        bridge.reconcile({"desired": "TRACKING", "generation": 5})
        self.assertEqual(len(calls), 2)
        bridge._close_output()

    def test_crash_reports_redacted_tracker_output_tail(self):
        process = FakeProcess()
        bridge, _ = self.make_bridge(lambda *args, **kwargs: process)
        bridge.start(9)
        bridge.output_handle.write("setup detail\n")
        bridge.output_handle.write("PRODUCTION TRACKER FAULT: RuntimeError: pin\n")
        process.code = 1

        with mock.patch("builtins.print") as report:
            bridge.refresh_process()

        self.assertIn("RuntimeError", bridge.fault)
        self.assertNotIn("pin", bridge.fault)
        self.assertIn("[REDACTED]", bridge.fault)
        report.assert_called_once_with(bridge.fault, flush=True)

    def test_direct_stop_authoritatively_stops_live_direct_tracker_and_clears_aircraft(self):
        calls = []
        bridge, _ = self.make_bridge(lambda command, **kwargs: calls.append(command) or FakeProcess())
        bridge.home_reference_state = "HOME"
        bridge.reconcile({"desired": "STOPPED", "generation": 8,
                          "control": {"owner": "DIRECT_TRACKER", "command": "TRACKING",
                                      "generation": 2, "aircraftId": "abc123"}})
        self.assertIn("--direct", calls[0])
        bridge.current_aircraft = None
        bridge.home_reference_state = "HOME"
        with mock.patch.object(pi_bridge.os, "killpg", create=True) as killpg:
            bridge.reconcile({"desired": "STOPPED", "generation": 8,
                              "control": {"owner": "DIRECT_TRACKER", "command": "STOPPED",
                                          "generation": 3, "aircraftId": None}})
        killpg.assert_called_once_with(4321, pi_bridge.signal.SIGINT)
        self.assertIsNone(bridge.process)
        self.assertIsNone(bridge.current_aircraft)
        self.assertEqual(bridge.tracker_state, "STOPPED")

    def test_direct_stop_allows_existing_home_return_before_authoritative_process_stop(self):
        calls = []
        bridge, _ = self.make_bridge(lambda command, **kwargs: calls.append(command) or FakeProcess())
        bridge.home_reference_state = "HOME"
        bridge.reconcile({"control": {"owner": "DIRECT_TRACKER", "command": "TRACKING",
                                      "generation": 2, "aircraftId": "abc123"}})
        bridge.current_aircraft = "abc123"
        bridge.home_reference_state = "VERIFIED"

        def reached_home():
            bridge.current_aircraft = None
            bridge.home_reference_state = "HOME"

        with mock.patch.object(bridge, "_read_diagnostics", side_effect=reached_home) as read_diag:
            with mock.patch.object(pi_bridge.os, "killpg", create=True) as killpg:
                bridge.reconcile({"control": {"owner": "DIRECT_TRACKER", "command": "STOPPED",
                                              "generation": 3, "aircraftId": None}})
        read_diag.assert_called()
        killpg.assert_called_once_with(4321, pi_bridge.signal.SIGINT)
        self.assertIsNone(bridge.current_aircraft)
        self.assertEqual(bridge.tracker_state, "STOPPED")
    def test_direct_stop_with_unverified_reference_stops_immediately_without_home_wait(self):
        calls = []
        bridge, _ = self.make_bridge(lambda command, **kwargs: calls.append(command) or FakeProcess())
        bridge.home_reference_state = "HOME"
        bridge.reconcile({"control": {"owner": "DIRECT_TRACKER", "command": "TRACKING",
                                      "generation": 2, "aircraftId": "abc123"}})
        bridge.home_reference_state = "UNVERIFIED"
        bridge.current_aircraft = "abc123"
        with mock.patch.object(pi_bridge.os, "killpg", create=True) as killpg:
            bridge.reconcile({"control": {"owner": "DIRECT_TRACKER", "command": "STOPPED",
                                          "generation": 3, "aircraftId": None}})
        killpg.assert_called_once_with(4321, pi_bridge.signal.SIGINT)
        self.assertIsNone(bridge.current_aircraft)
        self.assertEqual(bridge.tracker_state, "STOPPED")

    def test_unverified_direct_tracking_is_blocked_without_launch(self):
        calls = []
        bridge, _ = self.make_bridge(lambda command, **kwargs: calls.append(command) or FakeProcess())
        bridge.reconcile({"desired": "STOPPED", "generation": 0,
                          "control": {"owner": "DIRECT_TRACKER", "command": "TRACKING",
                                      "generation": 11, "aircraftId": "abc123"}})
        self.assertEqual(calls, [])
        self.assertEqual(bridge.tracker_state, "STOPPED")
        self.assertEqual(bridge.home_reference_state, "UNVERIFIED")

    def test_establish_home_launches_direct_tracker_in_home_capture_mode(self):
        calls = []
        bridge, _ = self.make_bridge(lambda command, **kwargs: calls.append(command) or FakeProcess())
        bridge.reconcile({"desired": "STOPPED", "generation": 0,
                          "control": {"owner": "DIRECT_TRACKER", "command": "ESTABLISH_HOME",
                                      "generation": 10, "aircraftId": None}})
        self.assertEqual(bridge.tracker_state, "STARTING")
        self.assertIn("--direct", calls[0])
        self.assertIn("--establish-home", calls[0])
        self.assertEqual(bridge.home_reference_state, "UNVERIFIED")
        bridge._close_output()

    def test_clicking_b_transfers_direct_target_without_normal_tracker_takeover(self):
        calls = []
        bridge, _ = self.make_bridge(lambda command, **kwargs: calls.append(command) or FakeProcess())
        bridge.home_reference_state = "HOME"
        bridge.reconcile({"desired": "TRACKING", "generation": 99,
                          "control": {"owner": "DIRECT_TRACKER", "command": "TRACKING",
                                      "generation": 12, "aircraftId": "abc123"}})
        bridge.reconcile({"desired": "TRACKING", "generation": 100,
                          "control": {"owner": "DIRECT_TRACKER", "command": "TRACKING",
                                      "generation": 13, "aircraftId": "def456"}})
        self.assertEqual(len(calls), 1)
        self.assertIn("--direct", calls[0])
        self.assertEqual(bridge.process_mode, "DIRECT")
        bridge._close_output()


    def test_diagnostics_home_state_authorises_same_live_direct_session(self):
        calls = []
        process = FakeProcess()
        bridge, path = self.make_bridge(lambda command, **kwargs: calls.append(command) or process)
        bridge.start(1, direct=True, establish_home=True)
        bridge.diagnostics_path.write_text(
            '{"aircraft_id":null,"home_reference_state":"HOME","status":"HOME"}\n',
            encoding="utf-8")
        bridge._read_diagnostics()
        self.assertEqual(bridge.home_reference_state, "HOME")
        bridge.reconcile({"control": {"owner": "DIRECT_TRACKER", "command": "TRACKING",
                                      "generation": 2, "aircraftId": "abc123"}})
        self.assertEqual(len(calls), 1)
        self.assertIs(bridge.process, process)
        bridge._close_output()

    def test_tracker_exit_invalidates_home_for_next_session(self):
        process = FakeProcess()
        bridge, _ = self.make_bridge(lambda *args, **kwargs: process)
        bridge.start(1, direct=True, establish_home=True)
        bridge.home_reference_state = "HOME"
        process.code = 1
        bridge.refresh_process()
        self.assertEqual(bridge.home_reference_state, "UNVERIFIED")
        self.assertEqual(bridge.tracker_state, "FAULT")


if __name__ == "__main__":
    unittest.main()
