import contextlib
import io
import sys
from pathlib import Path
import unittest
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from control_panel_trim import PanelTrim, PanelFault, framed_targets


class PanelTests(unittest.TestCase):
    def setUp(self):
        self.now = 100
        self.panel = PanelTrim('https://example.invalid', 'test-only', clock=lambda: self.now)
        self.panel.last_reply = self.now
        self.panel.update('TRACKING', 'TEST', True, 0.1, 0.01)

    def command(self, pan=0.2, tilt=0.1):
        self.panel.pending = dict(revision=1, pan=pan, tilt=tilt)
        self.panel.deadline = self.now + 1

    def test_right_and_up_mapping_and_home_unchanged(self):
        home = (-2.6, 179.7)
        yaw, pitch = framed_targets(10, 179.7, 0.2, 0.1, *home, 0.5, 150, 5, 18)
        self.assertAlmostEqual(yaw, 10.2)
        self.assertAlmostEqual(pitch, 179.6)
        self.assertEqual(home, (-2.6, 179.7))

    def test_angle_wrap_and_safe_sector(self):
        yaw, _ = framed_targets(179.9, 179.7, 0.2, 0, 179, 179.7, 0.5, 150, 5, 18)
        self.assertAlmostEqual(yaw, -179.9)
        with self.assertRaises(PanelFault):
            framed_targets(149.9, 179.7, 0.2, 0, 0, 179.7, 0.5, 150, 5, 18)
        with self.assertRaises(PanelFault):
            framed_targets(0, 179.7, 0, 0.2, 0, 179.7, 17.9, 150, 5, 18)

    def test_release_keeps_offset_without_integrating_further(self):
        self.command()
        with contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(self.panel.offsets(), (0.2, 0.1))
        for _ in range(50):
            self.assertEqual(self.panel.offsets(), (0.2, 0.1))

    def test_expired_command_does_not_move(self):
        self.command(); self.now += 1.1
        self.assertEqual(self.panel.offsets(), (0, 0))

    def test_unready_or_stale_controller_rejects_trim(self):
        for mode, ready, age in [('RETURNING', False, 0.1), ('TRACKING', False, 0.1), ('TRACKING', True, 1.2)]:
            self.command(); self.panel.update(mode, ready=ready, telemetry_age=age, tick_age=0.01)
            self.assertEqual(self.panel.offsets(), (0, 0))

    def test_bounded_commands_independently_checked_on_pi(self):
        for value in [6, float('nan'), None, True, 0.26]:
            self.setUp(); self.command(pan=value)
            with self.assertRaises(PanelFault): self.panel.offsets()

    def test_loss_latches_and_does_not_resume(self):
        self.command(); self.now += 3.1
        with self.assertRaises(PanelFault): self.panel.require()
        self.panel.last_reply = self.now
        with self.assertRaises(PanelFault): self.panel.offsets()

    def test_new_session_starts_at_zero(self):
        self.command()
        with contextlib.redirect_stdout(io.StringIO()): self.panel.offsets()
        other = PanelTrim('https://example.invalid', 'test-only')
        self.assertEqual(other.applied['pan'], 0)
        self.assertNotEqual(other.session_id, self.panel.session_id)

    def test_bad_origins_rejected(self):
        for url in ['http://example.com', 'https://user:pw@example.com', 'https://example.com/api/control', 'https://example.com?pin=123']:
            with self.assertRaises(ValueError): PanelTrim(url, 'test-only')

    def test_transport_time_subtracted_from_command_deadline(self):
        def transport(_):
            self.now += 0.3
            return dict(ok=True, connected=True, sessionId=self.panel.session_id, serverNow=1000,
                        command=dict(revision=1, pan=0.1, tilt=0, expiresAt=1500))
        self.panel.transport = transport
        self.panel._exchange({})
        self.assertAlmostEqual(self.panel.deadline, self.now + 0.2)

    def test_stop_request_rejected_immediately(self):
        self.panel.transport = lambda _: dict(ok=True, connected=True, sessionId=self.panel.session_id, stopRequested=True)
        with self.assertRaisesRegex(PanelFault, 'STOP'): self.panel._exchange({})


if __name__ == '__main__': unittest.main()
