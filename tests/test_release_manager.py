import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

MODULE = Path(__file__).parents[1] / "scripts" / "release_manager.py"
SPEC = importlib.util.spec_from_file_location("release_manager", MODULE)
release_manager = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(release_manager)


class Result:
    def __init__(self, stdout=b""): self.stdout, self.stderr = stdout, b""


class ReleaseManagerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(); self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        (self.root / "scripts").mkdir()
        self.old = {"scripts/pi_bridge.py": b"print('old bridge')\n",
                    "scripts/production_tracker.py": b"print('old tracker')\n"}
        self.new = {"scripts/pi_bridge.py": b"print('new bridge')\n",
                    "scripts/production_tracker.py": b"print('new tracker')\n"}
        for path, value in self.old.items(): (self.root / path).write_bytes(value)
        self.manifest = {"schema": 1, "releaseId": "recovery-1", "serverCommit": "a" * 40,
                         "piFiles": [{"path": p, "sha256": hashlib.sha256(v).hexdigest()} for p, v in self.new.items()]}

    def runner(self, command, **kwargs):
        if command[-2] == "show": return Result(self.new[command[-1].split(":", 1)[1]])
        return Result()

    def test_rejects_unknown_path_and_bad_hash(self):
        bad = json.loads(json.dumps(self.manifest)); bad["piFiles"][0]["path"] = "/etc/mikeaircraft/pi-bridge.env"
        with self.assertRaises(release_manager.ReleaseError): release_manager.validate_manifest(bad)
        bad = json.loads(json.dumps(self.manifest)); bad["piFiles"][0]["sha256"] = "0" * 64
        manager = release_manager.ReleaseManager(self.root, runner=self.runner)
        with self.assertRaises(release_manager.ReleaseError): manager.stage(bad)
        self.assertEqual((self.root / "scripts/pi_bridge.py").read_bytes(), self.old["scripts/pi_bridge.py"])

    def test_backup_install_confirm_and_marker(self):
        manager = release_manager.ReleaseManager(self.root, runner=self.runner, now=lambda: 7)
        pending = manager.stage(self.manifest); manager.install_staged(pending); marker = manager.confirm(pending)
        self.assertEqual((self.root / "scripts/pi_bridge.py").read_bytes(), self.new["scripts/pi_bridge.py"])
        self.assertEqual(marker["releaseId"], "recovery-1")
        self.assertEqual(manager.installed()["serverCommit"], "a" * 40)

    def test_health_failure_rolls_back_and_preserves_unmanaged_files(self):
        calibration = self.root / "camera-reference.json"; calibration.write_bytes(b"calibration")
        env = self.root / "pi-bridge.env"; env.write_bytes(b"SECRET=kept")
        manager = release_manager.ReleaseManager(self.root, runner=self.runner)
        pending = manager.stage(self.manifest); manager.install_staged(pending)
        manager.rollback(pending, "health failure")
        for path, value in self.old.items(): self.assertEqual((self.root / path).read_bytes(), value)
        self.assertEqual(calibration.read_bytes(), b"calibration")
        self.assertEqual(env.read_bytes(), b"SECRET=kept")

    def test_rollback_removes_managed_file_that_did_not_exist_before(self):
        (self.root / "scripts" / "production_tracker.py").unlink()
        manager = release_manager.ReleaseManager(self.root, runner=self.runner)
        pending = manager.stage(self.manifest); manager.install_staged(pending)
        self.assertTrue((self.root / "scripts" / "production_tracker.py").exists())
        manager.rollback(pending, "health failure")
        self.assertFalse((self.root / "scripts" / "production_tracker.py").exists())

    def test_git_source_and_runtime_install_are_separate(self):
        source = self.root / "source"
        runtime = self.root / "runtime"
        source.mkdir()
        (runtime / "scripts").mkdir(parents=True)
        for path, value in self.old.items(): (runtime / path).write_bytes(value)
        commands = []

        def runner(command, **kwargs):
            commands.append(command)
            if command[-2] == "show": return Result(self.new[command[-1].split(":", 1)[1]])
            return Result()

        manager = release_manager.ReleaseManager(source, runtime, runner=runner)
        pending = manager.stage(self.manifest)
        manager.install_staged(pending)
        self.assertTrue(all(command[2] == str(source.resolve()) for command in commands))
        self.assertEqual((runtime / "scripts/pi_bridge.py").read_bytes(), self.new["scripts/pi_bridge.py"])
        self.assertFalse((source / "scripts/pi_bridge.py").exists())


if __name__ == "__main__": unittest.main()
