#!/usr/bin/env python3
"""Root-owned fixed-purpose release poller; it never executes server commands."""

import json
import os
from pathlib import Path
import subprocess
import time
import urllib.request

from release_manager import ReleaseManager, ReleaseError, validate_manifest

SERVICE = "mikeaircraft-pi-bridge.service"


def fetch_approved(base_url, token, opener=urllib.request.urlopen):
    request = urllib.request.Request(
        base_url.rstrip("/") + "/api/release-feed", method="GET",
        headers={"Authorization": "Bearer " + token, "User-Agent": "MikeAircraft-Release-Agent/1"})
    with opener(request, timeout=10) as response:
        body = json.loads(response.read().decode("utf-8"))
    approved = body.get("approvedRelease")
    return validate_manifest(approved["manifest"]) if approved else None


def service(*args):
    subprocess.run(["systemctl", *args, SERVICE], check=True,
                   stdout=subprocess.PIPE, stderr=subprocess.PIPE)


def wait_for_health(manager, release_id, timeout=30):
    deadline = time.time() + timeout
    health_path = manager.state_dir / "bridge-health.json"
    while time.time() < deadline:
        try:
            value = json.loads(health_path.read_text(encoding="utf-8"))
            release = value.get("release") or {}
            if (value.get("bridgeHealth") == "HEALTHY" and value.get("trackerHealth") != "FAULT" and
                    release.get("releaseId") == release_id):
                return True
        except (OSError, ValueError):
            pass
        time.sleep(1)
    return False


def main():
    base_url = os.environ["MIKEAIRCRAFT_BASE_URL"]
    token = os.environ["MIKEAIRCRAFT_PI_BRIDGE_TOKEN"]
    source_dir = Path(os.environ.get("MIKEAIRCRAFT_SOURCE_DIR", "/home/mike/MikeAircraft"))
    install_dir = Path(os.environ.get("MIKEAIRCRAFT_INSTALL_DIR", "/opt/mikeaircraft"))
    manager = ReleaseManager(source_dir, install_dir)
    manifest = fetch_approved(base_url, token)
    if manifest is None:
        return
    pending = manager.stage(manifest)
    if pending is None:
        return
    health_path = manager.state_dir / "bridge-health.json"
    try:
        service("stop")
        manager.install_staged(pending)
        if health_path.exists():
            health_path.unlink()
        service("start")
        if not wait_for_health(manager, manifest["releaseId"]):
            raise ReleaseError("bridge/tracker health confirmation timed out")
        manager.confirm(pending)
    except Exception:
        manager.rollback(pending)
        service("restart")
        raise


if __name__ == "__main__":
    main()
