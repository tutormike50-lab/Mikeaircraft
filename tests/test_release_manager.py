import hashlib
import importlib.util
import json
from pathlib import Path
import py_compile
import tempfile
import types
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
                    "scripts/production_tracker.py": b"print('old tracker')\n",
                    "scripts/control_panel_trim.py": b"print('old trim')\n"}
        self.new = {"scripts/pi_bridge.py": b"print('new bridge')\n",
                    "scripts/production_tracker.py": b"print('new tracker')\n",
                    "scripts/control_panel_trim.py": b"print('new trim')\n"}
        for path, value in self.old.items(): (self.root / path).write_bytes(value)
        self.manifest = {"schema": 1, "releaseId": "recovery-1", "serverCommit": "a" * 40,
                         "piFiles": [{"path": p, "sha256": hashlib.sha256(v).hexdigest()} for p, v in self.new.items()]}

    def runner(self, command, **kwargs):
        if command[-2] == "show": return Result(self.new[command[-1].split(":", 1)[1]])
        return Result()

    def test_allowlist_is_exact_and_includes_control_panel_trim(self):
        self.assertEqual(release_manager.ALLOWED_FILES, frozenset({
            "scripts/pi_bridge.py",
            "scripts/release_manager.py",
            "scripts/production_tracker.py",
            "scripts/production_tracking.py",
            "scripts/camera_optics.py",
            "scripts/control_panel_trim.py",
        }))
        self.assertIs(release_manager.validate_manifest(self.manifest), self.manifest)

    def test_rejects_unknown_path_and_bad_hash(self):
        bad = json.loads(json.dumps(self.manifest)); bad["piFiles"][0]["path"] = "/etc/mikeaircraft/pi-bridge.env"
        with self.assertRaises(release_manager.ReleaseError): release_manager.validate_manifest(bad)
        bad = json.loads(json.dumps(self.manifest)); bad["piFiles"][0]["sha256"] = "0" * 64
        manager = release_manager.ReleaseManager(self.root, runner=self.runner)
        with self.assertRaises(release_manager.ReleaseError): manager.stage(bad)
        self.assertEqual((self.root / "scripts/pi_bridge.py").read_bytes(), self.old["scripts/pi_bridge.py"])

    def test_backup_install_confirm_and_marker(self):
        manager = release_manager.ReleaseManager(self.root, runner=self.runner, now=lambda: 7)
        pending = manager.stage(self.manifest)
        staged = Path(pending["stagingDir"]) / "scripts/control_panel_trim.py"
        backup = Path(pending["backupDir"]) / "scripts/control_panel_trim.py"
        self.assertEqual(staged.read_bytes(), self.new["scripts/control_panel_trim.py"])
        self.assertEqual(backup.read_bytes(), self.old["scripts/control_panel_trim.py"])
        manager.install_staged(pending)
        self.assertEqual((self.root / "scripts/pi_bridge.py").read_bytes(), self.new["scripts/pi_bridge.py"])
        self.assertEqual((self.root / "scripts/control_panel_trim.py").read_bytes(),
                         self.new["scripts/control_panel_trim.py"])
        marker = manager.confirm(pending)
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
        target = self.root / "scripts" / "control_panel_trim.py"
        target.unlink()
        manager = release_manager.ReleaseManager(self.root, runner=self.runner)
        pending = manager.stage(self.manifest); manager.install_staged(pending)
        self.assertEqual(target.read_bytes(), self.new["scripts/control_panel_trim.py"])
        manager.rollback(pending, "health failure")
        self.assertFalse(target.exists())

    def test_python_compilation_happens_before_installation(self):
        invalid = dict(self.new)
        invalid["scripts/control_panel_trim.py"] = b"def broken(:\n"
        manifest = {"schema": 1, "releaseId": "compile-fail", "serverCommit": "b" * 40,
                    "piFiles": [{"path": p, "sha256": hashlib.sha256(v).hexdigest()}
                                for p, v in invalid.items()]}
        def runner(command, **kwargs):
            if command[-2] == "show":
                return Result(invalid[command[-1].split(":", 1)[1]])
            return Result()
        manager = release_manager.ReleaseManager(self.root, runner=runner)
        with self.assertRaises(py_compile.PyCompileError):
            manager.stage(manifest)
        self.assertEqual((self.root / "scripts/control_panel_trim.py").read_bytes(),
                         self.old["scripts/control_panel_trim.py"])

    def test_root_reads_user_owned_source_via_runuser_without_fetch(self):
        manager = release_manager.ReleaseManager(self.root, runner=self.runner)
        manager._source_git_user = lambda: "mike"
        commands = []

        def runner(command, **kwargs):
            commands.append(command)
            if command[-2] == "show":
                return Result(self.new[command[-1].split(":", 1)[1]])
            return Result()

        manager.runner = runner
        pending = manager.stage(self.manifest)
        self.assertTrue(commands)
        self.assertTrue(all(command[:4] == ["/usr/sbin/runuser", "-u", "mike", "--"]
                            for command in commands))
        self.assertFalse(any("fetch" in command for command in commands))
        self.assertTrue(any("cat-file" in command for command in commands))
        manager.rollback(pending, "test complete")

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
        self.assertEqual((runtime / "scripts/control_panel_trim.py").read_bytes(),
                         self.new["scripts/control_panel_trim.py"])
        self.assertFalse((source / "scripts/pi_bridge.py").exists())
        self.assertFalse((source / "scripts/control_panel_trim.py").exists())


if __name__ == "__main__": unittest.main()
