"""Offline regressions only. Fake BLE and aircraft data; no hardware/network.

Run: python -B -m unittest -v test_tower_guard_v2
The six byte-matched Pi source files are required in calibration_test_fixtures/
or beside this file. Imported BLE and aircraft I/O are replaced with fakes.
"""
import ast
import asyncio
import contextlib
import importlib
import io
import math
from pathlib import Path
import struct
import sys
import types
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
import tower_joystick_v1 as v2
from control_panel_trim import PanelTrim

FIXTURES = Path(__file__).parent / 'calibration_test_fixtures'
if not FIXTURES.is_dir():
    FIXTURES = Path(__file__).parent


class PolicyTests(unittest.TestCase):
    def setUp(self):
        self.now = 100.0
        self.guard = v2.SessionGuard(clock=lambda: self.now)
        self.guard.telemetry_at = self.now
        self.guard.capture(-2.7, 179.7)

    def test_original_home_is_preserved_across_both_observed_shifts(self):
        with contextlib.redirect_stdout(io.StringIO()):
            self.guard.trip('radio gap')
            for yaw in [-5.6, -5.9, 175, -179.9]:
                self.guard.telemetry_at = self.now
                with self.assertRaises(v2.SafetyStop):
                    self.guard.capture(yaw, 179.7)
                self.assertEqual(self.guard.home, (-2.7, 179.7))

    def test_fault_never_clears_when_radio_returns(self):
        with contextlib.redirect_stdout(io.StringIO()):
            with self.assertRaises(v2.SafetyStop):
                self.guard.require(False)
            self.guard.telemetry_at = self.now
            with self.assertRaises(v2.SafetyStop):
                self.guard.require(True)

    def test_stale_telemetry_blocks_even_when_connected(self):
        self.now += v2.TELEMETRY_MAX_AGE + 0.01
        with contextlib.redirect_stdout(io.StringIO()), self.assertRaises(v2.SafetyStop):
            self.guard.require(True)

    def test_command_watchdog_fails_closed_while_moving(self):
        self.guard.command_sent(0, 8)
        self.now += v2.COMMAND_MAX_AGE + 0.01
        self.guard.telemetry_at = self.now
        with contextlib.redirect_stdout(io.StringIO()), self.assertRaises(v2.SafetyStop):
            self.guard.check_watchdog(True)

    def test_neutral_can_wait_with_fresh_telemetry(self):
        self.guard.command_sent(0, 0)
        self.now += 100
        self.guard.telemetry_at = self.now
        self.guard.check_watchdog(True)

    def test_home_change_is_detected(self):
        with contextlib.redirect_stdout(io.StringIO()), self.assertRaises(v2.SafetyStop):
            self.guard.check_home(-5.9, 179.7)

    def test_double_capture_rejected(self):
        with contextlib.redirect_stdout(io.StringIO()), self.assertRaises(v2.SafetyStop):
            self.guard.capture(-2.7, 179.7)


class ConfigurationTests(unittest.TestCase):
    def test_check_never_loads_bluetooth_or_writes_files(self):
        sources = v2.verify_sources(FIXTURES)
        with patch.object(v2, 'verify_sources', return_value=sources):
            with patch.object(v2, 'load_controller', side_effect=AssertionError('No imports')):
                with patch.object(Path, 'open', side_effect=AssertionError('No writes')):
                    with contextlib.redirect_stdout(io.StringIO()):
                        self.assertEqual(v2.main(['--check', '--controller-dir', str(FIXTURES)]), 0)

    def test_guard_requires_flag_before_any_bluetooth(self):
        with contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit):
            v2.main(['--track-one'])

    def test_guard_requires_fresh_interactive_confirmation(self):
        with patch('builtins.input', return_value='no'), patch.object(v2, 'load_controller', side_effect=AssertionError('No imports')):
            with contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(v2.main(['--track-one', '--radar-centred', '--controller-dir', str(FIXTURES)]), 2)

    def test_missing_interactive_input_cancels_before_connect(self):
        with patch('builtins.input', side_effect=EOFError), patch.object(v2, 'load_controller', side_effect=AssertionError('No imports')):
            with contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(v2.main(['--track-one', '--radar-centred', '--controller-dir', str(FIXTURES)]), 130)

    def test_hash_mismatch_rejected(self):
        with patch.object(Path, 'read_bytes', return_value=b'changed'):
            with self.assertRaisesRegex(RuntimeError, 'differs'):
                v2.verify_sources(FIXTURES)

    def test_alignment_and_original_acquisition_sector_unchanged(self):
        ref = v2.calculate_alignment(v2.verify_sources(FIXTURES))
        self.assertAlmostEqual(ref['bearing'], 329.797733806, places=8)
        self.assertAlmostEqual(ref['elevation'], 0.565855952, places=8)
        for n in range(7200):
            bearing = n / 20
            self.assertEqual(5 <= v2.wrap180(bearing-16) <= 30,
                             ref['right_min'] <= v2.wrap180(bearing-ref['bearing']) <= ref['right_max'])

    def test_only_initial_capture_assigns_home_after_none(self):
        module = ast.parse(Path(v2.__file__).read_text())
        fn = next(n for n in module.body if isinstance(n, ast.AsyncFunctionDef) and n.name == 'guarded_main')
        assignments = []
        for node in ast.walk(fn):
            if isinstance(node, (ast.Assign, ast.AugAssign)):
                targets = node.targets if isinstance(node, ast.Assign) else [node.target]
                if any(isinstance(n, ast.Name) and n.id in {'home_yaw', 'home_pitch'} for target in targets for n in ast.walk(target)):
                    assignments.append(node)
        self.assertEqual(len(assignments), 3)  # two None initialisations + one capture
        self.assertNotIn('reference preserved after reconnect', ast.unparse(fn))


class FakeRig:
    def __init__(self, scenario='normal'):
        self.scenario = scenario
        self.clients = []
        self.writes = []
        self.write_times = []
        self.triggered = False
        self.yaw = -2.7
        self.pitch = 179.7
        self.telemetry = True
        self.return_started = False
        self.engine_calls = 0

    def client_factory(self, *args, **kwargs):
        rig = self

        class Client:
            def __init__(self):
                self.index = len(rig.clients)
                self.is_connected = False
                self.cb = kwargs.get('disconnected_callback')
                self.notify = None
                self.task = None
                self.services = types.SimpleNamespace(get_characteristic=lambda _: 'TX')
                rig.clients.append(self)

            async def connect(self):
                if self.index and rig.scenario == 'recovery_failure':
                    raise OSError('simulated radio unavailable')
                self.is_connected = True

            async def disconnect(self):
                self.is_connected = False
                if self.task:
                    self.task.cancel()
                    with contextlib.suppress(asyncio.CancelledError):
                        await self.task
                if self.cb:
                    self.cb(self)

            async def start_notify(self, _, callback):
                self.notify = callback
                async def notifications():
                    while self.is_connected:
                        if rig.telemetry:
                            frame = bytearray(19)
                            frame[0] = 0x55
                            frame[9:11] = bytes([4, 5])
                            struct.pack_into('<hhh', frame, 11, round(rig.pitch*10), 0, round(rig.yaw*10))
                            callback(None, frame)
                        await asyncio.sleep(1.0 if rig.scenario == 'slow_telemetry' else 0.04)
                self.task = asyncio.create_task(notifications())

            async def write_gatt_char(self, _, packet, response=False):
                tilt, roll, pan = struct.unpack_from('<hhh', packet, 11)
                tilt -= 1024
                pan -= 1024
                rig.writes.append((self.index, tilt, pan, rig.triggered))
                rig.write_times.append((asyncio.get_running_loop().time(), tilt, pan, rig.return_started))
                if not self.is_connected:
                    raise OSError('disconnected write')
                should_trigger = bool(tilt or pan) and not rig.triggered
                if rig.scenario == 'drop_on_home':
                    should_trigger = should_trigger and rig.return_started
                if should_trigger and rig.scenario in {'drop', 'silent_drop', 'recovery_failure', 'drop_on_home'}:
                    rig.triggered = True
                    self.is_connected = False
                    rig.yaw = -5.9  # arbitrary frame change during gap
                    if self.cb and rig.scenario != 'silent_drop':
                        self.cb(self)
                elif should_trigger and rig.scenario == 'write_failure':
                    rig.triggered = True
                    raise OSError('simulated GATT failure')
                elif should_trigger and rig.scenario == 'stale':
                    rig.triggered = True
                    rig.telemetry = False
                elif should_trigger and rig.scenario == 'delayed_write':
                    rig.triggered = True
                    await asyncio.sleep(20)
                elif should_trigger and rig.scenario == 'cancel':
                    rig.triggered = True
                    asyncio.current_task().cancel()
                    await asyncio.sleep(0)
                elif should_trigger and rig.scenario == 'home_timeout':
                    rig.triggered = True
                    rig.yaw += 0.8  # then jam: no further physical movement
                if rig.scenario != 'home_timeout':
                    rig.yaw = v2.wrap180(rig.yaw + (0.1 if pan > 0 else -0.1 if pan < 0 else 0))
                    rig.pitch = v2.wrap180(rig.pitch + (-0.1 if tilt > 0 else 0.1 if tilt < 0 else 0))

        return Client()


class IntegrationTests(unittest.IsolatedAsyncioTestCase):
    async def run_scenario(self, scenario):
        rig = FakeRig(scenario)
        if scenario == 'wrap':
            rig.yaw, rig.pitch = 179.9, -179.9
        original_home = (rig.yaw, rig.pitch)
        bleak = types.ModuleType('bleak')
        bleak.BleakClient = rig.client_factory
        # Load actual verified helper implementations, but replace all external I/O.
        with patch.dict(sys.modules, {'bleak': bleak}), patch('urllib.request.urlopen', side_effect=AssertionError('NETWORK FORBIDDEN')):
            lead = v2.load_controller(FIXTURES)
            stable = lead.stable
            reference = v2.calculate_alignment(v2.verify_sources(FIXTURES))
            target = dict(callsign='TEST', bearing=reference['bearing']+(20 if scenario == 'cadence' else 1.5),
                          elevation=reference['elevation'] + (0.8 if scenario in {'tilt', 'wrap'} else 0),
                          distance=6, source='FAKE')
            selection = dict(hex='abcdef', callsign='TEST', state='ON_FINAL')
            transcript = io.StringIO()
            original_print = print
            def capture_print(*args, **kwargs):
                if args and str(args[0]).startswith('RETURNING TO ORIGINAL'):
                    rig.return_started = True
                original_print(*args, **kwargs)
            def engine():
                rig.engine_calls += 1
                if scenario == 'waiting_drop' and not rig.triggered:
                    rig.triggered = True
                    rig.clients[0].is_connected = False
                    rig.clients[0].cb(rig.clients[0])
                return {}
            async def fake_to_thread(func, *args, **kwargs):
                if scenario in {'slow_data', 'cadence'} and rig.writes and any(t or p for _, t, p, _ in rig.writes):
                    await asyncio.sleep(0.4)
                return func(*args, **kwargs)
            config = dict(BleakClient=rig.client_factory, ribbon_current=lambda _: selection,
                          MAX_TRACK_SECONDS=1.5 if scenario == 'cadence' else 0.8 if scenario.startswith('panel_') or scenario == 'slow_data' else 0.25,
                          TARGET_REFRESH_SECONDS=0.05, RIBBON_CHECK_SECONDS=0.05,
                          HOME_TIMEOUT_SECONDS=0.15)
            with patch.multiple(stable, **config), patch.object(stable.geom.base, 'fetch_engine', engine), patch.object(stable.resilient, 'resilient_target', return_value=target):
                with patch.multiple(stable.geom, REFERENCE_BEARING_DEG=reference['bearing'], HOME_REFERENCE_ELEV_DEG=reference['elevation']):
                    with patch.object(v2, 'TELEMETRY_MAX_AGE', 1.5 if scenario == 'slow_telemetry' else 0.25), patch.object(v2, 'COMMAND_MAX_AGE', 0.2), patch.object(v2, 'WRITE_TIMEOUT', 0.08):
                        with patch.object(v2.asyncio, 'to_thread', fake_to_thread), patch('builtins.print', capture_print), contextlib.redirect_stdout(transcript):
                            panel = None
                            if scenario.startswith('panel_'):
                                class FakePanel(PanelTrim):
                                    def start(self):
                                        self.last_reply = self.clock()
                                    def require(self):
                                        self.last_reply = self.clock()
                                        if scenario in {'panel_loss', 'panel_stop'} and any(t or p for _, t, p, _ in rig.writes):
                                            self.trip('Panel link lost' if scenario == 'panel_loss' else 'Operator STOP')
                                        super().require()
                                    def update(self, mode, target='', ready=False, telemetry_age=999, tick_age=999):
                                        super().update(mode, target, ready, telemetry_age, tick_age)
                                        if scenario == 'panel_trim' and ready and self.applied['revision'] == 0:
                                            self.pending = dict(revision=1, pan=0.2, tilt=0.2)
                                            self.deadline = self.clock() + 1
                                    def close(self):
                                        self.closed.set()
                                panel = FakePanel('https://fake.invalid', 'not-a-real-pin')
                            code = await asyncio.wait_for(v2.guarded_main(stable, panel=panel), 18)
                            if panel is not None:
                                self.assertTrue(panel.closed.is_set())
                                if scenario == 'panel_trim':
                                    self.assertEqual(panel.applied['revision'], 1)
            self.assertTrue(all(not c.is_connected for c in rig.clients))
            self.assertTrue(all(c.task is None or c.task.done() for c in rig.clients))
            self.assertIn(f'FINAL SAVED HOME yaw={original_home[0]:+.2f} pitch={original_home[1]:+.2f}; never rebased.', transcript.getvalue())
            # The old source files remain exactly byte-matched after every run.
            v2.verify_sources(FIXTURES)
            return code, transcript.getvalue(), rig

    async def assert_fault(self, scenario, text):
        code, output, rig = await self.run_scenario(scenario)
        self.assertEqual(code, 2, output)
        self.assertIn(text, output)
        self.assertNotIn('HOME ANGLES REACHED', output)
        self.assertNotIn('TEST COMPLETE', output)
        self.assertTrue(all(t == 0 and p == 0 for i, t, p, _ in rig.writes if i > 0))
        if scenario in {'drop', 'silent_drop', 'recovery_failure', 'write_failure', 'delayed_write', 'drop_on_home'}:
            self.assertTrue(all(t == 0 and p == 0 for _, t, p, after in rig.writes if after))
        return output, rig

    async def test_normal_tracking_and_home_still_work(self):
        code, output, rig = await self.run_scenario('normal')
        self.assertEqual(code, 0, output)
        self.assertIn('HOME ANGLES REACHED', output)
        self.assertEqual(len(rig.clients), 1)
        self.assertTrue(any(t or p for _, t, p, _ in rig.writes))
        self.assertLessEqual(abs(v2.wrap180(rig.yaw+2.7)), 0.18)

    async def test_panel_trim_is_applied_only_to_tracking_not_home(self):
        code, output, rig = await self.run_scenario('panel_trim')
        self.assertEqual(code, 0, output)
        self.assertIn('FRAMING accepted', output)
        self.assertLessEqual(abs(v2.wrap180(rig.yaw+2.7)), 0.18)
        self.assertLessEqual(abs(v2.wrap180(rig.pitch-179.7)), 0.18)

    async def test_panel_loss_stops_without_home(self):
        await self.assert_fault('panel_loss', 'Panel link lost')

    async def test_panel_stop_stops_without_home(self):
        await self.assert_fault('panel_stop', 'Operator STOP')

    async def test_one_hz_telemetry_can_capture_and_return_home(self):
        code, output, rig = await self.run_scenario('slow_telemetry')
        self.assertEqual(code, 0, output)
        self.assertIn('HOME ANGLES REACHED', output)
        self.assertLessEqual(abs(v2.wrap180(rig.yaw+2.7)), 0.18)

    async def test_disconnect_mid_track_never_rebases_or_resumes(self):
        output, rig = await self.assert_fault('drop', 'STOP-ONLY reconnect')
        self.assertEqual(len(rig.clients), 2)

    async def test_disconnect_while_waiting_never_moves(self):
        output, rig = await self.assert_fault('waiting_drop', 'STOP-ONLY reconnect')
        self.assertTrue(all(t == 0 and p == 0 for _, t, p, _ in rig.writes))

    async def test_existing_tilt_direction_and_return_preserved(self):
        code, output, rig = await self.run_scenario('tilt')
        self.assertEqual(code, 0, output)
        self.assertTrue(any(t > 0 for _, t, _, _ in rig.writes))
        self.assertLessEqual(abs(v2.wrap180(rig.pitch-179.7)), 0.18)

    async def test_home_and_motion_across_180_degree_wrap(self):
        code, output, rig = await self.run_scenario('wrap')
        self.assertEqual(code, 0, output)
        self.assertLessEqual(abs(v2.wrap180(rig.yaw-179.9)), 0.18)
        self.assertLessEqual(abs(v2.wrap180(rig.pitch+179.9)), 0.18)

    async def test_disconnect_without_callback_detected_by_watchdog(self):
        await self.assert_fault('silent_drop', 'connection lost')

    async def test_disconnect_during_return_never_reports_success(self):
        await self.assert_fault('drop_on_home', 'STOP-ONLY reconnect')

    async def test_recovery_failure_reports_physical_stop_needed(self):
        await self.assert_fault('recovery_failure', 'STOP DELIVERY FAILED')

    async def test_command_write_failure_latches_fault(self):
        await self.assert_fault('write_failure', 'command write failed')

    async def test_delayed_command_write_is_bounded(self):
        await self.assert_fault('delayed_write', 'command write failed')

    async def test_stale_telemetry_ends_run(self):
        await self.assert_fault('stale', 'telemetry missing or stale')

    async def test_slow_data_does_not_starve_motor_loop(self):
        code, output, _ = await self.run_scenario('slow_data')
        self.assertEqual(code, 0, output)
        self.assertNotIn('control loop delayed', output)

    async def test_slow_data_preserves_command_cadence(self):
        code, output, rig = await self.run_scenario('cadence')
        times = [at for at, tilt, pan, returning in rig.write_times if (tilt or pan) and not returning]
        self.assertGreaterEqual(len(times), 20, output)
        self.assertLess(max(b-a for a, b in zip(times, times[1:])), 0.15, output)
        self.assertEqual(code, 0, output)

    async def test_home_timeout_is_failure_not_success(self):
        code, output, rig = await self.run_scenario('home_timeout')
        self.assertEqual(code, 3, output)
        self.assertIn('HOME NOT REACHED', output)
        self.assertNotIn('TEST COMPLETE', output)

    async def test_operator_cancel_sends_neutral_and_does_not_return_home(self):
        code, output, rig = await self.run_scenario('cancel')
        self.assertEqual(code, 130, output)
        self.assertNotIn('RETURNING TO ORIGINAL', output)
        self.assertTrue(all(t == 0 and p == 0 for _, t, p, after in rig.writes if after))


if __name__ == '__main__':
    unittest.main()
