import importlib.util
import io
from pathlib import Path
import tempfile
import unittest
from unittest import mock

MODULE_PATH = Path(__file__).parents[1] / "scripts" / "pi_bridge.py"
SPEC = importlib.util.spec_from_file_location("pi_bridge", MODULE_PATH)
pi_bridge = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(pi_bridge)


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


if __name__ == "__main__":
    unittest.main()
