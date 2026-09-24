import importlib.util
import hashlib
import io
import json
from pathlib import Path
import sys
import unittest
import urllib.request


MODULE_PATH = Path(__file__).resolve().parents[1] / "scripts" / "link_v2_agent.py"
SPEC = importlib.util.spec_from_file_location("link_v2_agent", MODULE_PATH)
link = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = link
SPEC.loader.exec_module(link)


NOW = 1_800_000_000.0


def iso(seconds):
    from datetime import datetime, timezone
    return datetime.fromtimestamp(seconds, timezone.utc).isoformat().replace("+00:00", "Z")


def envelope(**updates):
    value = {"protocolVersion": link.PROTOCOL_VERSION, "releaseId": link.RELEASE_ID,
             "sequence": 7, "commandId": "cmd-7", "selectedIcao": "Ab12Ef",
             "callsign": " TEST 7 ", "issuedAt": iso(NOW - 1), "expiresAt": iso(NOW + 30)}
    value.update(updates)
    return value


class CommandStateTests(unittest.TestCase):
    def setUp(self):
        self.clock = [NOW]
        self.state = link.CommandState(now=lambda: self.clock[0])

    def test_accepts_fresh_command_and_emits_tracker_contract(self):
        self.assertTrue(self.state.accept(envelope()))
        self.assertEqual(self.state.direct_payload(),
                         {"command": "TRACKING", "aircraftId": "ab12ef", "callsign": "TEST 7"})
        self.assertFalse(self.state.accept(envelope()))

    def test_matching_command_renews_lease_without_reapplying(self):
        self.state.accept(envelope(expiresAt=iso(NOW + 5)))
        self.clock[0] = NOW + 4
        self.assertFalse(self.state.accept(envelope(expiresAt=iso(NOW + 30))))
        self.clock[0] = NOW + 6
        self.assertEqual(self.state.direct_payload()["command"], "TRACKING")

    def test_duplicate_identity_cannot_change_command_content(self):
        self.state.accept(envelope())
        with self.assertRaisesRegex(link.CommandRejected, "different command content"):
            self.state.accept(envelope(selectedIcao="123456"))

    def test_expiry_stops_locally_without_another_server_response(self):
        self.state.accept(envelope())
        self.clock[0] = NOW + 31
        self.assertEqual(self.state.direct_payload(),
                         {"command": "STOPPED", "aircraftId": None, "callsign": None})

    def test_explicit_clear_stops_tracking(self):
        self.state.accept(envelope(selectedIcao=None, callsign=None))
        self.assertEqual(self.state.direct_payload()["command"], "STOPPED")

    def test_rejects_protocol_and_release_mismatch(self):
        for update in ({"protocolVersion": "v1"}, {"releaseId": "wrong"}):
            with self.subTest(update=update), self.assertRaises(link.CommandRejected):
                self.state.accept(envelope(**update))

    def test_rejects_expired_future_and_invalid_lifetime(self):
        unsafe = [
            {"issuedAt": iso(NOW - 20), "expiresAt": iso(NOW)},
            {"issuedAt": iso(NOW + 11), "expiresAt": iso(NOW + 30)},
            {"issuedAt": iso(NOW + 1), "expiresAt": iso(NOW)},
        ]
        for update in unsafe:
            with self.subTest(update=update), self.assertRaises(link.CommandRejected):
                self.state.accept(envelope(**update))

    def test_rejects_bad_icao_and_bad_sequence(self):
        for update in ({"selectedIcao": "oops"}, {"sequence": -1}, {"sequence": True}):
            with self.subTest(update=update), self.assertRaises(link.CommandRejected):
                self.state.accept(envelope(**update))

    def test_rejects_replay_order_and_sequence_reuse(self):
        self.state.accept(envelope())
        with self.assertRaisesRegex(link.CommandRejected, "backwards"):
            self.state.accept(envelope(sequence=6, commandId="cmd-6"))
        with self.assertRaisesRegex(link.CommandRejected, "reused"):
            self.state.accept(envelope(commandId="different"))

    def test_restart_does_not_restore_target(self):
        self.state.accept(envelope())
        restarted = link.CommandState(now=lambda: self.clock[0])
        self.assertEqual(restarted.direct_payload()["command"], "STOPPED")


class FakeResponse:
    status = 200

    def __init__(self, body):
        self.body = body

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def read(self):
        return json.dumps(self.body).encode("utf-8")


class FakeProcess:
    pid = 1234

    def poll(self):
        return None


class AgentTests(unittest.TestCase):
    def test_protected_tracker_files_match_ec9b423(self):
        root = Path(__file__).resolve().parents[1]
        expected = {
            "production_tracker.py": "2d81494078d78a46beb1cd65f0f87d4bc03a6b3e108f9b79acc48b53ab7278c6",
            "production_tracking.py": "9e62f72c9771ef9e3ae207cfd0f3c307e097070caf62fe595388094e3b95e1d1",
            "camera_optics.py": "e52b6d511c8c0816d50849d003c9a215e16459caa59cb89d1ecef56653755abb",
        }
        for name, digest in expected.items():
            with self.subTest(name=name):
                self.assertEqual(hashlib.sha256((root / "scripts" / name).read_bytes()).hexdigest(), digest)

    def test_heartbeat_is_authenticated_and_contains_coherent_identity(self):
        seen = {}

        def opener(request, timeout):
            seen["request"] = request
            seen["timeout"] = timeout
            return FakeResponse(envelope())

        agent = link.LinkV2Agent("https://example.invalid", "new-independent-secret", "pin",
                                 Path(__file__).resolve().parents[1], "logs", opener=opener,
                                 now=lambda: NOW)
        agent.tracker = FakeProcess()
        self.assertEqual(agent.heartbeat()["commandId"], "cmd-7")
        request = seen["request"]
        self.assertEqual(request.full_url, "https://example.invalid/api/link-v2/commands")
        self.assertEqual(request.get_header("Authorization"), "Bearer new-independent-secret")
        payload = json.loads(request.data)
        self.assertEqual(payload["protocolVersion"], link.PROTOCOL_VERSION)
        self.assertEqual(payload["releaseId"], link.RELEASE_ID)
        self.assertEqual(payload["trackerState"], "RUNNING")
        self.assertNotIn("new-independent-secret", request.data.decode())
        self.assertNotIn("pin", request.data.decode())

    def test_tracker_launch_uses_unchanged_tracker_and_local_adapter(self):
        seen = {}

        def popen(command, **kwargs):
            seen["command"] = command
            seen["kwargs"] = kwargs
            return FakeProcess()

        root = Path(__file__).resolve().parents[1]
        agent = link.LinkV2Agent("https://example.invalid", "secret", "existing-pin", root,
                                 root / "var" / "test-link-v2", popen=popen, now=lambda: NOW)
        agent.server = type("Server", (), {"server_port": 9876})()
        agent.start_tracker()
        command = seen["command"]
        self.assertIn(str(root / "scripts" / "production_tracker.py"), command)
        self.assertIn("--direct", command)
        self.assertEqual(command[command.index("--direct-tracker-url") + 1],
                         "http://127.0.0.1:9876/api/direct-tracker")
        self.assertEqual(seen["kwargs"]["env"]["MIKEAIRCRAFT_CONTROL_PIN"], "existing-pin")
        agent.tracker_log.close()

    def test_loopback_endpoint_exposes_compatible_json(self):
        state = link.CommandState(now=lambda: NOW)
        state.accept(envelope())
        handler = type("TestHandler", (link.LocalDirectHandler,), {"state": state})
        server = link.ThreadingHTTPServer(("127.0.0.1", 0), handler)
        import threading
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            with urllib.request.urlopen(
                    "http://127.0.0.1:{}/api/direct-tracker".format(server.server_port)) as response:
                self.assertEqual(json.load(response)["aircraftId"], "ab12ef")
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=2)


if __name__ == "__main__":
    unittest.main()
