import asyncio
from pathlib import Path
import sys
import types
import unittest


SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"
sys.path.insert(0, str(SCRIPTS))

from production_tracker import (BleLifecycleError, DjiFrameDecoder, client_connected,
                                effective_write_hz, make_disconnect_callback,
                                prepare_rs4_gatt, rs4_protocol_response)  # noqa: E402


class FakeTx:
    def __init__(self, events):
        self.events = events
        self.reads = 0

    @property
    def max_write_without_response_size(self):
        self.reads += 1
        self.events.append(f"size:{self.reads}")
        return 20 if self.reads == 1 else 22


class ProductionTrackerBleTests(unittest.IsolatedAsyncioTestCase):
    def test_captured_rs4_requests_produce_exact_official_app_responses(self):
        captures = [
            ("551204c70402a8ee0004380000646400bc01",
             "550d04330204a8ee8004389e9f"),
            ("551204c70402a9ee2004640000000000e78e",
             "550d04330204a9ee800464330c"),
            ("550d0433270207014000003e42",
             "550d043302270701800000634a"),
        ]
        for request, response in captures:
            self.assertEqual(rs4_protocol_response(bytes.fromhex(request)),
                             bytes.fromhex(response))

    def test_decoder_reassembles_and_separates_captured_frames(self):
        first = bytes.fromhex("551204c70402a8ee0004380000646400bc01")
        second = bytes.fromhex("551204c70402a9ee2004640000000000e78e")
        decoder = DjiFrameDecoder()
        self.assertEqual(decoder.feed(first[:7]), [])
        self.assertEqual(decoder.feed(first[7:] + second), [first, second])

    def test_unrelated_telemetry_does_not_generate_protocol_response(self):
        telemetry = bytes.fromhex(
            "553e044b0402a8ee00040507070000a0fe84005b010001b2f7250053d00000"
            "e4ff0800b3090d3ab8f65f3f07fff73e138f533b0000000001000000008259")
        self.assertIsNone(rs4_protocol_response(telemetry))

    def test_effective_write_rate_counts_intervals(self):
        self.assertEqual(effective_write_hz(0, None, None), 0.0)
        self.assertEqual(effective_write_hz(1, 10.0, 10.0), 0.0)
        self.assertAlmostEqual(effective_write_hz(21, 10.0, 11.0), 20.0)

    def test_lifecycle_error_preserves_stage_cause_and_disconnect_time(self):
        original = RuntimeError("Not connected")
        try:
            try:
                raise original
            except RuntimeError as error:
                raise BleLifecycleError("command_write", str(error), 12.5) from error
        except BleLifecycleError as fault:
            self.assertEqual(fault.stage, "command_write")
            self.assertIs(fault.__cause__, original)
            self.assertIn("disconnect_monotonic_s=12.500000", str(fault))

    def test_connection_probe_is_safe_during_cleanup(self):
        class ConnectedClient:
            is_connected = True

        class DisconnectedClient:
            is_connected = False

        class BrokenClient:
            @property
            def is_connected(self):
                raise RuntimeError("backend already gone")

        self.assertTrue(client_connected(ConnectedClient()))
        self.assertFalse(client_connected(DisconnectedClient()))
        self.assertFalse(client_connected(None))
        self.assertFalse(client_connected(BrokenClient()))

    def test_post_connect_disconnect_records_only_active_unexpected_client(self):
        active = object()
        stale = object()
        intentional = False
        recorded = []
        callback = make_disconnect_callback(
            lambda: active, lambda: intentional,
            lambda client, occurred_at: recorded.append((client, occurred_at)))

        callback(stale)
        self.assertEqual(recorded, [])
        callback(active)
        self.assertIs(recorded[0][0], active)
        self.assertIsInstance(recorded[0][1], float)
        intentional = True
        callback(active)
        self.assertEqual(len(recorded), 1)

    async def test_proven_gatt_lifecycle_waits_notifies_then_resolves_ready_tx(self):
        events = []
        tx = FakeTx(events)

        async def sleep(delay):
            events.append(f"sleep:{delay}")

        class Client:
            async def start_notify(self, uuid, callback):
                events.append(f"notify:{uuid}")

            services = types.SimpleNamespace(
                get_characteristic=lambda uuid: events.append(f"tx:{uuid}") or tx)

        ble = types.SimpleNamespace(RX="rx", TX="tx")
        result = await prepare_rs4_gatt(Client(), ble, lambda *_: None, sleep=sleep)

        self.assertIs(result, tx)
        self.assertEqual(events, [
            "sleep:0.8", "notify:rx", "tx:tx", "size:1", "sleep:0.4", "size:2"
        ])


if __name__ == "__main__":
    unittest.main()
