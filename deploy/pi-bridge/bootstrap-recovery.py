#!/usr/bin/env python3
"""One-time, fixed-purpose MikeAircraft recovery bootstrap.

This installer accepts only a full Git commit whose allowlisted payload bytes
match the reviewed hashes below. It preserves credentials and all unmanaged
files, installs only the dedicated release agent units, and rolls back every
managed path if verification or health confirmation fails.
"""

import argparse
import hashlib
import json
import os
from pathlib import Path
import py_compile
import re
import shutil
import subprocess
import tempfile
import time
import urllib.request

REPOSITORY = "https://github.com/tutormike50-lab/Mikeaircraft.git"
RAW_ROOT = "https://raw.githubusercontent.com/tutormike50-lab/Mikeaircraft"
INSTALL_DIR = Path("/opt/mikeaircraft")
SOURCE_DIR = Path("/home/mike/MikeAircraft")
ENV_FILE = Path("/etc/mikeaircraft/pi-bridge.env")
SYSTEMD_DIR = Path("/etc/systemd/system")
BRIDGE_SERVICE = "mikeaircraft-pi-bridge.service"
RELEASE_SERVICE = "mikeaircraft-release-agent.service"
RELEASE_TIMER = "mikeaircraft-release-agent.timer"
RELEASE_ID = "ec9b423-recovery-bootstrap-v1"

# Only these reviewed payloads can be installed. The three tracker hashes are
# the exact ec9b423 bytes; the bridge/manager hashes are infrastructure only.
PI_FILES = {
    "scripts/pi_bridge.py": "90ee92489107dbca112e6ba7294541446a6d42f8906703bef7ddf30cc8456991",
    "scripts/release_manager.py": "bfacddd9f5c59bd78b5e783f040a90158eaf812fa8a6b4a8c07e0d26b6ffb231",
    "scripts/production_tracker.py": "40215803f7e864121781c56c27d1818f5115fb204d31cc785d8a63b72e640d20",
    "scripts/production_tracking.py": "27f8ba829826fe737285767c109814d71815fd905249879f80f2b3f1cdd0cb50",
    "scripts/camera_optics.py": "d7c5a2f1d634fd219f631e3bcca6444938333c75dd849b1f0e04c088e122f7f9",
}
BOOTSTRAP_FILES = {
    "scripts/release_agent.py": "cc850922ed6793d70a263c2cbcb73e71f3ae9fe8ecbe19398180b036fcea0ec8",
    "deploy/pi-bridge/mikeaircraft-release-agent.service": "fbc3db8b71e6f341f70f0279c88f27e8d795737821fa4460dc4fb1aa62fb3f6c",
    "deploy/pi-bridge/mikeaircraft-release-agent.timer": "36093a5b03176969456654115c0bbd4ff4e7055f769a3ba93eb211bfe0087039",
}


class BootstrapError(RuntimeError):
    pass


def run(*command, check=True):
    return subprocess.run(command, check=check, text=True,
                          stdout=subprocess.PIPE, stderr=subprocess.PIPE)


def read_environment(path):
    values = {}
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "'\"":
            value = value[1:-1]
            if raw.split("=", 1)[1].strip().startswith("'"):
                value = value.replace("'\\''", "'")
        values[key.strip()] = value
    return values


def request_json(url, token=None, pin=None, method="GET", body=None):
    headers = {"User-Agent": "MikeAircraft-Recovery-Bootstrap/1"}
    if token:
        headers["Authorization"] = "Bearer " + token
    if pin:
        headers["x-mikeaircraft-control-pin"] = pin
    data = None
    if body is not None:
        data = json.dumps(body, separators=(",", ":")).encode("utf-8")
        headers["Content-Type"] = "application/json"
    request = urllib.request.Request(url, data=data, method=method, headers=headers)
    with urllib.request.urlopen(request, timeout=20) as response:
        return json.loads(response.read().decode("utf-8"))


def download_verified(commit, relative, expected):
    url = f"{RAW_ROOT}/{commit}/{relative}"
    with urllib.request.urlopen(url, timeout=30) as response:
        content = response.read()
    actual = hashlib.sha256(content).hexdigest()
    if actual != expected:
        raise BootstrapError(f"SHA-256 mismatch for {relative}: {actual}")
    return content


def manifest(commit):
    return {"schema": 1, "releaseId": RELEASE_ID, "serverCommit": commit,
            "piFiles": [{"path": path, "sha256": digest}
                        for path, digest in PI_FILES.items()]}


def atomic_write(target, source):
    target.parent.mkdir(parents=True, exist_ok=True)
    temporary = target.with_name(target.name + ".bootstrap-new")
    shutil.copy2(source, temporary)
    os.replace(temporary, target)


def is_reviewed_origin(value):
    normalized = value.strip().lower().removesuffix(".git")
    return normalized in {
        "https://github.com/tutormike50-lab/mikeaircraft",
        "git@github.com:tutormike50-lab/mikeaircraft",
        "ssh://git@github.com/tutormike50-lab/mikeaircraft",
    }


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--server-commit", required=True)
    args = parser.parse_args(argv)
    commit = args.server_commit
    if os.geteuid() != 0:
        raise BootstrapError("run with sudo")
    if not re.fullmatch(r"[0-9a-f]{40}", commit):
        raise BootstrapError("--server-commit must be a full lowercase Git SHA-1")
    if not ENV_FILE.is_file():
        raise BootstrapError("existing /etc/mikeaircraft/pi-bridge.env is required and was not changed")
    if run("systemctl", "cat", BRIDGE_SERVICE, check=False).returncode != 0:
        raise BootstrapError("existing Pi bridge service is required and was not replaced")
    if not (SOURCE_DIR / ".git").exists():
        raise BootstrapError("existing /home/mike/MikeAircraft Git checkout is required")
    remote = run("git", "-C", str(SOURCE_DIR), "remote", "get-url", "origin").stdout.strip()
    if not is_reviewed_origin(remote):
        raise BootstrapError("existing /home/mike/MikeAircraft origin is not the reviewed repository")

    environment = read_environment(ENV_FILE)
    base_url = environment.get("MIKEAIRCRAFT_BASE_URL", "").rstrip("/")
    token = environment.get("MIKEAIRCRAFT_PI_BRIDGE_TOKEN", "")
    pin = environment.get("MIKEAIRCRAFT_CONTROL_PIN", "")
    if not base_url.startswith("https://") or not token or not pin:
        raise BootstrapError("existing bridge URL/token/PIN are missing")

    feed = request_json(base_url + "/api/release-feed", token=token)
    if feed.get("serverVersion") != commit:
        raise BootstrapError("deployed server does not match the pinned bootstrap commit")
    previous_approval = feed.get("approvedRelease")
    recovery_manifest = manifest(commit)

    state_dir = INSTALL_DIR / "var" / "releases"
    state_dir.mkdir(parents=True, exist_ok=True)
    backup_dir = Path(tempfile.mkdtemp(prefix="bootstrap-backup-", dir=state_dir))
    stage_dir = Path(tempfile.mkdtemp(prefix="bootstrap-stage-", dir=state_dir))
    managed = list(PI_FILES) + list(BOOTSTRAP_FILES)
    destinations = {path: INSTALL_DIR / path for path in managed}
    destinations["deploy/pi-bridge/mikeaircraft-release-agent.service"] = SYSTEMD_DIR / RELEASE_SERVICE
    destinations["deploy/pi-bridge/mikeaircraft-release-agent.timer"] = SYSTEMD_DIR / RELEASE_TIMER
    existed = set()
    marker = state_dir / "installed.json"
    marker_backup = backup_dir / "installed.json"
    timer_was_enabled = run("systemctl", "is-enabled", RELEASE_TIMER, check=False).returncode == 0
    bridge_stopped = False

    try:
        for path, expected in {**PI_FILES, **BOOTSTRAP_FILES}.items():
            target = stage_dir / path
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(download_verified(commit, path, expected))
            if target.suffix == ".py":
                py_compile.compile(str(target), doraise=True)
        for path, target in destinations.items():
            if target.exists():
                saved = backup_dir / path
                saved.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(target, saved)
                existed.add(path)
        if marker.exists():
            shutil.copy2(marker, marker_backup)

        # Approval is explicit and contains no command, URL, service, or target path.
        request_json(base_url + "/api/release-control", pin=pin,
                     method="POST", body=recovery_manifest)

        run("systemctl", "stop", BRIDGE_SERVICE)
        bridge_stopped = True
        for path, target in destinations.items():
            atomic_write(target, stage_dir / path)

        # Fetch and verify only in the existing source checkout. The runtime
        # installation deliberately remains a non-Git directory.
        run("git", "-C", str(SOURCE_DIR), "fetch", "--quiet", "origin", commit)
        run("git", "-C", str(SOURCE_DIR), "cat-file", "-e", commit + "^{commit}")

        marker_value = {**recovery_manifest, "installedAt": int(time.time())}
        marker_temp = marker.with_suffix(".json.bootstrap-new")
        marker_temp.write_text(json.dumps(marker_value, sort_keys=True) + "\n", encoding="utf-8")
        os.replace(marker_temp, marker)

        run("systemctl", "daemon-reload")
        run("systemctl", "enable", "--now", RELEASE_TIMER)
        check = run("/usr/bin/python3", str(INSTALL_DIR / "scripts/production_tracker.py"),
                    "--check", "--direct")
        if "PRODUCTION TRACKER CHECK OK" not in check.stdout:
            raise BootstrapError("production_tracker.py --direct check did not report OK")
        run("systemctl", "start", BRIDGE_SERVICE)
        bridge_stopped = False

        deadline = time.time() + 45
        status = None
        while time.time() < deadline:
            time.sleep(2)
            try:
                status = request_json(base_url + "/api/tracker-control", pin=pin)
            except Exception:
                continue
            if (status.get("serverVersion") == commit and status.get("piVersion") == commit and
                    status.get("approvedReleaseId") == RELEASE_ID and status.get("match") is True and
                    status.get("bridgeHealth") == "HEALTHY" and status.get("trackerHealth") == "HEALTHY"):
                break
        else:
            raise BootstrapError("server/Pi match and HEALTHY confirmation timed out")

        print(json.dumps({"ready": True, "releaseId": RELEASE_ID,
                          "serverVersion": status.get("serverVersion"),
                          "piVersion": status.get("piVersion"), "match": status.get("match"),
                          "bridgeHealth": status.get("bridgeHealth"),
                          "trackerHealth": status.get("trackerHealth"),
                          "knownGoodBaseline": "ec9b423"}, indent=2))
        shutil.rmtree(stage_dir, ignore_errors=True)
        return 0
    except Exception:
        for path, target in destinations.items():
            saved = backup_dir / path
            if path in existed and saved.exists():
                atomic_write(target, saved)
            elif path not in existed and target.exists():
                target.unlink()
        if marker_backup.exists():
            atomic_write(marker, marker_backup)
        elif marker.exists():
            marker.unlink()
        run("systemctl", "daemon-reload", check=False)
        if not timer_was_enabled:
            run("systemctl", "disable", "--now", RELEASE_TIMER, check=False)
        if bridge_stopped or run("systemctl", "is-active", BRIDGE_SERVICE, check=False).returncode != 0:
            run("systemctl", "restart", BRIDGE_SERVICE, check=False)
        try:
            if previous_approval and previous_approval.get("manifest"):
                request_json(base_url + "/api/release-control", pin=pin,
                             method="POST", body=previous_approval["manifest"])
            else:
                request_json(base_url + "/api/release-control", pin=pin, method="DELETE")
        except Exception:
            pass
        shutil.rmtree(stage_dir, ignore_errors=True)
        raise


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(json.dumps({"ready": False, "error": str(error)}))
        raise SystemExit(1)
