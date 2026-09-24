#!/usr/bin/env python3
"""MikeAircraft Link V2: outbound command transport and local tracker adapter.

This process is deliberately separate from Pi Bridge V1.  It polls the V2 API,
rejects commands that are incompatible or no longer fresh, and exposes only the
currently valid Direct Tracker selection on a loopback HTTP endpoint.  The
known-good production tracker remains unmodified.
"""

import argparse
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import threading
import time
import urllib.request


PROTOCOL_VERSION = "mikeaircraft-link-v2"
RELEASE_ID = "ec9b423-link-v2"
AGENT_VERSION = "2.0.0"
DEFAULT_POLL_SECONDS = 2.0
DEFAULT_TTL_SKEW_SECONDS = 10.0
TRACKER_STOP_TIMEOUT_SECONDS = 12.0


def utc_timestamp(value):
    if not isinstance(value, str) or not value.strip():
        raise ValueError("timestamp is missing")
    normalized = value.strip()
    if normalized.endswith("Z"):
        normalized = normalized[:-1] + "+00:00"
    parsed = datetime.fromisoformat(normalized)
    if parsed.tzinfo is None:
        raise ValueError("timestamp must include a timezone")
    return parsed.astimezone(timezone.utc).timestamp()


def clean_icao(value):
    candidate = str(value or "").strip().lower()
    if len(candidate) == 6 and all(character in "0123456789abcdef" for character in candidate):
        return candidate
    return None


class CommandRejected(ValueError):
    """A command was authenticated by the server but is unsafe to apply."""


class CommandState:
    """In-memory only command state; target selections are never restored at boot."""

    def __init__(self, now=time.time, future_skew_seconds=DEFAULT_TTL_SKEW_SECONDS):
        self.now = now
        self.future_skew_seconds = future_skew_seconds
        self.lock = threading.Lock()
        self.command = None
        self.highest_sequence = -1
        self.last_command_id = None
        self.last_received_at = None
        self.rejection = None

    def accept(self, envelope):
        now = self.now()
        if not isinstance(envelope, dict):
            raise CommandRejected("response did not contain a command object")
        if envelope.get("protocolVersion") != PROTOCOL_VERSION:
            raise CommandRejected("protocol version mismatch")
        if envelope.get("releaseId") != RELEASE_ID:
            raise CommandRejected("release mismatch")
        sequence = envelope.get("sequence")
        if not isinstance(sequence, int) or isinstance(sequence, bool) or sequence < 0:
            raise CommandRejected("sequence must be a non-negative integer")
        command_id = str(envelope.get("commandId") or "").strip()
        if not command_id or len(command_id) > 128:
            raise CommandRejected("commandId is missing or too long")
        issued_at = utc_timestamp(envelope.get("issuedAt"))
        expires_at = utc_timestamp(envelope.get("expiresAt"))
        if expires_at <= issued_at:
            raise CommandRejected("command expiry is not after issue time")
        if issued_at > now + self.future_skew_seconds:
            raise CommandRejected("command issue time is too far in the future")
        if expires_at <= now:
            raise CommandRejected("command is expired")
        selected = envelope.get("selectedIcao")
        if selected is not None:
            selected = clean_icao(selected)
            if not selected:
                raise CommandRejected("selectedIcao is not a six-character ICAO hex")
        callsign = str(envelope.get("callsign") or selected or "").strip()[:24] or None
        with self.lock:
            if sequence < self.highest_sequence:
                raise CommandRejected("command sequence moved backwards")
            if sequence == self.highest_sequence and command_id != self.last_command_id:
                raise CommandRejected("sequence was reused with a different commandId")
            if sequence == self.highest_sequence and command_id == self.last_command_id:
                stable = (self.command and self.command["selectedIcao"] == selected and
                          self.command["callsign"] == callsign and
                          self.command["issuedAt"] == issued_at)
                if not stable:
                    raise CommandRejected("commandId was reused with different command content")
                # A matching response renews the short lease, but does not reapply
                # or otherwise replay the target command.
                self.command["expiresAt"] = expires_at
                self.last_received_at = now
                self.rejection = None
                return False
            self.highest_sequence = sequence
            self.last_command_id = command_id
            self.last_received_at = now
            self.rejection = None
            self.command = {"sequence": sequence, "commandId": command_id,
                            "selectedIcao": selected, "callsign": callsign,
                            "issuedAt": issued_at, "expiresAt": expires_at}
        return True

    def reject(self, reason):
        with self.lock:
            self.rejection = str(reason)

    def direct_payload(self):
        now = self.now()
        with self.lock:
            command = dict(self.command) if self.command else None
        if not command or command["expiresAt"] <= now or not command["selectedIcao"]:
            return {"command": "STOPPED", "aircraftId": None, "callsign": None}
        return {"command": "TRACKING", "aircraftId": command["selectedIcao"],
                "callsign": command["callsign"] or command["selectedIcao"]}

    def heartbeat_fields(self):
        with self.lock:
            command = dict(self.command) if self.command else None
            rejection = self.rejection
        applied = bool(command and command["expiresAt"] > self.now())
        return {"lastSequence": self.highest_sequence if self.highest_sequence >= 0 else None,
                "lastCommandId": self.last_command_id,
                "lastCommandReceivedAt": self.last_received_at,
                "commandFresh": applied,
                "commandRejected": rejection}


class LocalDirectHandler(BaseHTTPRequestHandler):
    state = None

    def do_GET(self):
        if self.path.split("?", 1)[0] != "/api/direct-tracker":
            self.send_error(404)
            return
        body = json.dumps(self.state.direct_payload(), separators=(",", ":")).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, _format, *_args):
        return


class LinkV2Agent:
    def __init__(self, base_url, token, control_pin, repo_dir, log_dir,
                 listen_host="127.0.0.1", listen_port=8765, poll_seconds=DEFAULT_POLL_SECONDS,
                 opener=urllib.request.urlopen, popen=subprocess.Popen, now=time.time,
                 sleep=time.sleep):
        self.endpoint = base_url.rstrip("/") + "/api/link-v2/commands"
        self.token = token
        self.control_pin = control_pin
        self.repo_dir = Path(repo_dir).resolve()
        self.log_dir = Path(log_dir).resolve()
        self.listen_host = listen_host
        self.listen_port = int(listen_port)
        self.poll_seconds = float(poll_seconds)
        self.opener = opener
        self.popen = popen
        self.now = now
        self.sleep = sleep
        self.state = CommandState(now=now)
        self.tracker = None
        self.tracker_log = None
        self.tracker_fault = None
        self.server = None
        self.server_thread = None
        self.running = True
        self.started_at = now()

    def _tracker_status(self):
        if self.tracker is None:
            return "STOPPED"
        code = self.tracker.poll()
        if code is None:
            return "RUNNING"
        if not self.tracker_fault:
            self.tracker_fault = "tracker exited with code " + str(code)
        return "FAULT"

    def heartbeat(self):
        payload = {"protocolVersion": PROTOCOL_VERSION, "releaseId": RELEASE_ID,
                   "agentVersion": AGENT_VERSION, "agentStartedAt": self.started_at,
                   "runtimePath": str(Path(__file__).resolve()),
                   "sourcePath": str(self.repo_dir),
                   "trackerState": self._tracker_status(),
                   "trackerPid": self.tracker.pid if self.tracker and self.tracker.poll() is None else None,
                   "trackerFault": self.tracker_fault,
                   "authState": "CONFIGURED"}
        payload.update(self.state.heartbeat_fields())
        request = urllib.request.Request(
            self.endpoint, data=json.dumps(payload).encode("utf-8"), method="POST",
            headers={"Authorization": "Bearer " + self.token,
                     "Content-Type": "application/json",
                     "User-Agent": "MikeAircraft-Link-V2/" + AGENT_VERSION})
        with self.opener(request, timeout=10) as response:
            return json.loads(response.read().decode("utf-8"))

    def start_local_server(self):
        handler = type("BoundLocalDirectHandler", (LocalDirectHandler,), {"state": self.state})
        self.server = ThreadingHTTPServer((self.listen_host, self.listen_port), handler)
        self.server_thread = threading.Thread(target=self.server.serve_forever,
                                              name="link-v2-local-api", daemon=True)
        self.server_thread.start()

    def start_tracker(self):
        self.log_dir.mkdir(parents=True, exist_ok=True)
        stamp = time.strftime("%Y%m%dT%H%M%SZ", time.gmtime(self.now()))
        diagnostics = self.log_dir / ("production-tracker-link-v2-" + stamp + ".jsonl")
        output = self.log_dir / ("production-tracker-link-v2-" + stamp + ".log")
        self.tracker_log = output.open("a", encoding="utf-8", buffering=1)
        local_url = "http://{}:{}/api/direct-tracker".format(self.listen_host, self.server.server_port)
        command = [sys.executable, str(self.repo_dir / "scripts" / "production_tracker.py"),
                   "--track", "--direct", "--direct-tracker-url", local_url,
                   "--log", str(diagnostics)]
        environment = os.environ.copy()
        environment["MIKEAIRCRAFT_CONTROL_PIN"] = self.control_pin
        self.tracker = self.popen(command, cwd=str(self.repo_dir), env=environment,
                                  stdin=subprocess.DEVNULL, stdout=self.tracker_log,
                                  stderr=subprocess.STDOUT, text=True, start_new_session=True)

    def stop(self):
        self.running = False
        if self.server:
            self.server.shutdown()
            self.server.server_close()
            self.server = None
        process = self.tracker
        if process is not None and process.poll() is None:
            try:
                os.killpg(process.pid, signal.SIGINT)
                process.wait(timeout=TRACKER_STOP_TIMEOUT_SECONDS)
            except subprocess.TimeoutExpired:
                os.killpg(process.pid, signal.SIGTERM)
                process.wait(timeout=3)
            except ProcessLookupError:
                pass
        self.tracker = None
        if self.tracker_log:
            self.tracker_log.close()
            self.tracker_log = None

    def poll_once(self):
        envelope = self.heartbeat()
        try:
            changed = self.state.accept(envelope)
            if changed:
                print("Link V2 accepted command", envelope.get("commandId"),
                      "sequence", envelope.get("sequence"), flush=True)
        except (CommandRejected, ValueError) as error:
            self.state.reject(error)
            print("Link V2 rejected command:", error, flush=True)

    def run(self):
        self.start_local_server()
        self.start_tracker()
        while self.running:
            try:
                self.poll_once()
            except Exception as error:
                print("Link V2 poll failed:", error, flush=True)
            self.sleep(self.poll_seconds)


def required(name):
    value = os.environ.get(name, "").strip()
    if not value:
        raise SystemExit(name + " is required")
    return value


def configuration():
    repo_dir = Path(os.environ.get("MIKEAIRCRAFT_LINK_V2_REPO_DIR",
                                   Path(__file__).resolve().parent.parent))
    return {"base_url": required("MIKEAIRCRAFT_BASE_URL"),
            "token": required("MIKEAIRCRAFT_LINK_V2_TOKEN"),
            "control_pin": required("MIKEAIRCRAFT_CONTROL_PIN"),
            "repo_dir": repo_dir,
            "log_dir": os.environ.get("MIKEAIRCRAFT_LINK_V2_LOG_DIR", str(repo_dir / "var" / "log")),
            "listen_host": os.environ.get("MIKEAIRCRAFT_LINK_V2_LISTEN_HOST", "127.0.0.1"),
            "listen_port": int(os.environ.get("MIKEAIRCRAFT_LINK_V2_LISTEN_PORT", "8765")),
            "poll_seconds": float(os.environ.get("MIKEAIRCRAFT_LINK_V2_POLL_SECONDS", "2"))}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true",
                        help="validate configuration and protected tracker paths without network or hardware")
    arguments = parser.parse_args(argv)
    settings = configuration()
    tracker = Path(settings["repo_dir"]) / "scripts" / "production_tracker.py"
    if not tracker.is_file():
        raise SystemExit("protected production tracker is missing: " + str(tracker))
    if settings["listen_host"] not in {"127.0.0.1", "::1", "localhost"}:
        raise SystemExit("MIKEAIRCRAFT_LINK_V2_LISTEN_HOST must be loopback-only")
    if arguments.check:
        print("LINK V2 CHECK OK: protocol={}, release={}, tracker={}".format(
            PROTOCOL_VERSION, RELEASE_ID, tracker))
        return 0
    agent = LinkV2Agent(**settings)
    try:
        agent.run()
    except KeyboardInterrupt:
        pass
    finally:
        agent.stop()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
