import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import textwrap
import unittest


ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = ROOT / "scripts"
CONTROLLER_FIXTURES = ROOT / "tests" / "calibration_test_fixtures"


class ControllerLocationIntegrationTests(unittest.TestCase):
    def test_installed_tracker_loads_pinned_home_controller_chain(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            install_directory = (Path(temporary_directory) / "opt" /
                                 "mikeaircraft" / "scripts")
            shutil.copytree(SCRIPTS, install_directory)
            controller_directory = Path(temporary_directory) / "home" / "mike"
            shutil.copytree(CONTROLLER_FIXTURES, controller_directory)
            for source in controller_directory.glob("*.py"):
                source.write_bytes(source.read_bytes().replace(b"\r\n", b"\n"))
            environment = os.environ.copy()
            environment["MIKEAIRCRAFT_V2_CONTROLLER_DIR"] = str(controller_directory)
            program = textwrap.dedent(
                """
                import asyncio
                import importlib
                from pathlib import Path
                import sys
                import types
                from types import SimpleNamespace

                sys.path.insert(0, sys.argv[1])
                import production_tracker

                bleak = types.ModuleType("bleak")
                bleak.BleakClient = object
                sys.modules["bleak"] = bleak

                protected_names = (
                    "home_arrival_right_acquire_center_lead_test",
                    "home_real_position_pan_tilt_stable_hybrid_test",
                    "home_real_position_pan_tilt_resilient_test",
                    "home_real_position_pan_tilt_test",
                    "virtual_hill_tracker",
                    "virtual_hill_local",
                )
                install_directory = Path(sys.argv[1]).resolve()
                controller_directory = Path(sys.argv[2]).resolve()
                for name in protected_names:
                    module = importlib.import_module(name)
                    actual = Path(module.__file__).resolve().parent
                    if actual != install_directory:
                        raise AssertionError(f"preload {name} resolved from {actual}")

                class ControllerChainLoaded(Exception):
                    pass

                def stop_after_controller_load(*args, **kwargs):
                    for name in protected_names:
                        actual = Path(sys.modules[name].__file__).resolve().parent
                        print(f"{name} => {actual}")
                        if actual != controller_directory:
                            raise AssertionError(f"guarded load {name} resolved from {actual}")
                    raise ControllerChainLoaded()

                production_tracker.load_camera_reference = stop_after_controller_load
                args = SimpleNamespace(camera_reference_url="unused", pin="unused")
                try:
                    asyncio.run(production_tracker.run(args))
                except ControllerChainLoaded:
                    pass
                else:
                    raise AssertionError("tracker did not reach camera loading")
                """
            )

            result = subprocess.run(
                [sys.executable, "-c", program, str(install_directory),
                 str(controller_directory)],
                cwd=install_directory,
                env=environment,
                capture_output=True,
                text=True,
                timeout=20,
            )

        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        for name in (
            "home_arrival_right_acquire_center_lead_test",
            "home_real_position_pan_tilt_stable_hybrid_test",
            "home_real_position_pan_tilt_resilient_test",
            "home_real_position_pan_tilt_test",
            "virtual_hill_tracker",
            "virtual_hill_local",
        ):
            self.assertIn(f"{name} => {controller_directory.resolve()}", result.stdout)


if __name__ == "__main__":
    unittest.main()
