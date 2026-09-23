#!/usr/bin/env python3
"""Outbound-only MikeAircraft Pi Bridge V1."""

import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import time
import urllib.request

POLL_SECONDS = 2.0
STOP_TIMEOUT_SECONDS = 12.0


class PiBridge:
    def __init__(self, base_url, token, control_pin, repo_dir, log_dir,
                 opener=urllib.request.urlopen, popen=subprocess.Popen,
                 sleep=time.sleep, now=time.time):
        self.endpoint = base_url.rstrip("/") + "/api/pi-bridge"
        self.token = token
        self.control_pin = control_pin
        self.repo_dir = Path(repo_dir).resolve()
        self.log_dir = Path(log_dir).resolve()
        self.opener = opener
        self.popen = popen
        self.sleep = sleep
        self.now = now
        self.process = None
        self.output_handle = None
        self.diagnostics_path = None
        self.diagnostics_offset = 0
        self.tracker_state = "STOPPED"
        self.current_aircraft = None
        self.rs4_state = None
        self.fault = None
        self.attempted_generation = None

    def heartbeat(self):
        self.refresh_process()
        payload = json.dumps({"trackerState": self.tracker_state,
                              "currentAircraft": self.current_aircraft,
                              "rs4State": self.rs4_state,
                              "fault": self.fault}).encode("utf-8")
        request = urllib.request.Request(
            self.endpoint, data=payload, method="POST",
            headers={"Authorization": "Bearer " + self.token,
                     "Content-Type": "application/json",
                     "User-Agent": "MikeAircraft-Pi-Bridge/1"})
        with self.opener(request, timeout=10) as response:
            return json.loads(response.read().decode("utf-8"))

    def start(self, generation):
        if self.process is not None and self.process.poll() is None:
            return
        if self.attempted_generation == generation:
            return
        self.attempted_generation = generation
        self.log_dir.mkdir(parents=True, exist_ok=True)
        stamp = time.strftime("%Y%m%dT%H%M%SZ", time.gmtime(self.now()))
        self.diagnostics_path = self.log_dir / ("production-tracker-" + stamp + ".jsonl")
        output_path = self.log_dir / ("production-tracker-" + stamp + ".log")
        self.output_handle = output_path.open("a", encoding="utf-8", buffering=1)
        command = [sys.executable, str(self.repo_dir / "scripts" / "production_tracker.py"),
                   "--track", "--log", str(self.diagnostics_path)]
        environment = os.environ.copy()
        environment["MIKEAIRCRAFT_CONTROL_PIN"] = self.control_pin
        try:
            self.process = self.popen(command, cwd=str(self.repo_dir), env=environment,
                                      stdin=subprocess.PIPE, stdout=self.output_handle,
                                      stderr=subprocess.STDOUT, text=True,
                                      start_new_session=True)
            self.process.stdin.write("TRACK CURRENT\n")
            self.process.stdin.flush()
            self.process.stdin.close()
            self.tracker_state = "STARTING"
            self.current_aircraft = None
            self.rs4_state = None
            self.fault = None
            self.diagnostics_offset = 0
        except Exception as error:
            if self.process is not None and self.process.poll() is None:
                try:
                    os.killpg(self.process.pid, signal.SIGTERM)
                    self.process.wait(timeout=3)
                except subprocess.TimeoutExpired:
                    os.killpg(self.process.pid, signal.SIGKILL)
                    self.process.wait(timeout=3)
                except ProcessLookupError:
                    pass
            self._close_output()
            self.process = None
            self.tracker_state = "FAULT"
            self.fault = "Tracker start failed: " + str(error)

    def stop(self):
        process = self.process
        if process is not None and process.poll() is None:
            try:
                os.killpg(process.pid, signal.SIGINT)
                process.wait(timeout=STOP_TIMEOUT_SECONDS)
            except subprocess.TimeoutExpired:
                os.killpg(process.pid, signal.SIGTERM)
                try:
                    process.wait(timeout=3)
                except subprocess.TimeoutExpired:
                    os.killpg(process.pid, signal.SIGKILL)
                    process.wait(timeout=3)
            except ProcessLookupError:
                pass
        self.process = None
        self._close_output()
        self.tracker_state = "STOPPED"
        self.current_aircraft = None
        self.rs4_state = None
        self.fault = None

    def refresh_process(self):
        process = self.process
        if process is None:
            return
        self._read_diagnostics()
        code = process.poll()
        if code is None:
            return
        self.process = None
        self._close_output()
        self.tracker_state = "FAULT"
        self.fault = "Production tracker exited with code " + str(code)

    def reconcile(self, desired):
        generation = int(desired.get("generation") or 0)
        if desired.get("desired") == "TRACKING":
            self.start(generation)
        else:
            self.stop()

    def _read_diagnostics(self):
        if not self.diagnostics_path or not self.diagnostics_path.exists():
            return
        with self.diagnostics_path.open("r", encoding="utf-8") as handle:
            handle.seek(self.diagnostics_offset)
            for line in handle:
                try:
                    row = json.loads(line)
                except (ValueError, TypeError):
                    continue
                if "aircraft_id" in row:
                    self.current_aircraft = str(row["aircraft_id"]) if row["aircraft_id"] else None
                    self.tracker_state = "TRACKING"
                if row.get("bluetooth_state"):
                    self.rs4_state = str(row["bluetooth_state"])
            self.diagnostics_offset = handle.tell()

    def _close_output(self):
        if self.output_handle:
            self.output_handle.close()
            self.output_handle = None

    def run(self):
        while True:
            try:
                self.reconcile(self.heartbeat())
            except Exception as error:
                print("Pi Bridge poll failed:", error, flush=True)
            self.sleep(POLL_SECONDS)


def required(name):
    value = os.environ.get(name, "").strip()
    if not value:
        raise SystemExit(name + " is required")
    return value


def main():
    import fcntl
    lock_path = Path(os.environ.get("MIKEAIRCRAFT_PI_BRIDGE_LOCK", "/run/mikeaircraft-pi-bridge.lock"))
    lock_path.parent.mkdir(parents=True, exist_ok=True)
    lock = lock_path.open("w", encoding="utf-8")
    try:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        raise SystemExit("Another Pi Bridge instance is already running")
    repo_dir = Path(os.environ.get("MIKEAIRCRAFT_REPO_DIR", Path(__file__).resolve().parent.parent))
    bridge = PiBridge(required("MIKEAIRCRAFT_BASE_URL"),
                      required("MIKEAIRCRAFT_PI_BRIDGE_TOKEN"),
                      required("MIKEAIRCRAFT_CONTROL_PIN"), repo_dir,
                      os.environ.get("MIKEAIRCRAFT_TRACKER_LOG_DIR", str(repo_dir / "var" / "log")))
    try:
        bridge.run()
    except KeyboardInterrupt:
        pass
    finally:
        bridge.stop()


if __name__ == "__main__":
    main()
