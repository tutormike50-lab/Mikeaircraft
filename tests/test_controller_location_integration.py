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
            environment = os.environ.copy()
            environment["MIKEAIRCRAFT_V2_CONTROLLER_DIR"] = str(CONTROLLER_FIXTURES)
            program = textwrap.dedent(
                """
                import asyncio
                import sys
                import types
                from types import SimpleNamespace

                sys.path.insert(0, sys.argv[1])
                import production_tracker

                bleak = types.ModuleType("bleak")
                bleak.BleakClient = object
                sys.modules["bleak"] = bleak

                class ControllerChainLoaded(Exception):
                    pass

                def stop_after_controller_load(*args, **kwargs):
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
                [sys.executable, "-c", program, str(install_directory)],
                cwd=install_directory,
                env=environment,
                capture_output=True,
                text=True,
                timeout=20,
            )

        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)


if __name__ == "__main__":
    unittest.main()
