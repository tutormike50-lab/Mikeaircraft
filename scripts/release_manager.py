#!/usr/bin/env python3
"""Strict, outbound-only release installer for the MikeAircraft Pi.

The server may select an already reviewed manifest.  This module never accepts a
command line from the server: it can only fetch exact files from an exact Git
commit into a fixed allowlist, verify hashes, and atomically install them.
"""

import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import py_compile
import shutil
import subprocess
import tempfile
import time

SCHEMA = 1
ALLOWED_FILES = frozenset({
    "scripts/pi_bridge.py",
    "scripts/release_manager.py",
    "scripts/production_tracker.py",
    "scripts/production_tracking.py",
    "scripts/camera_optics.py",
})


class ReleaseError(RuntimeError):
    pass


def sha256_bytes(value):
    return hashlib.sha256(value).hexdigest()


def validate_manifest(value):
    if not isinstance(value, dict) or set(value) != {"schema", "releaseId", "serverCommit", "piFiles"}:
        raise ReleaseError("manifest fields are invalid")
    if value["schema"] != SCHEMA:
        raise ReleaseError("manifest schema is unsupported")
    release_id = value["releaseId"]
    commit = value["serverCommit"]
    if not isinstance(release_id, str) or not release_id or len(release_id) > 80:
        raise ReleaseError("releaseId is invalid")
    if not isinstance(commit, str) or len(commit) != 40 or any(c not in "0123456789abcdef" for c in commit):
        raise ReleaseError("serverCommit must be a full lowercase SHA-1")
    files = value["piFiles"]
    if not isinstance(files, list) or not files:
        raise ReleaseError("piFiles must not be empty")
    seen = set()
    for item in files:
        if not isinstance(item, dict) or set(item) != {"path", "sha256"}:
            raise ReleaseError("piFiles entry is invalid")
        path = item["path"]
        digest = item["sha256"]
        if path not in ALLOWED_FILES or path in seen or PurePosixPath(path).is_absolute() or ".." in PurePosixPath(path).parts:
            raise ReleaseError("Pi file is not allowlisted: " + str(path))
        if not isinstance(digest, str) or len(digest) != 64 or any(c not in "0123456789abcdef" for c in digest):
            raise ReleaseError("sha256 is invalid for " + path)
        seen.add(path)
    if "scripts/pi_bridge.py" not in seen or "scripts/production_tracker.py" not in seen:
        raise ReleaseError("bridge and tracker must be versioned together")
    return value


class ReleaseManager:
    def __init__(self, repo_dir, runner=subprocess.run, now=time.time):
        self.repo_dir = Path(repo_dir).resolve()
        self.runner = runner
        self.now = now
        self.state_dir = self.repo_dir / "var" / "releases"
        self.installed_marker = self.state_dir / "installed.json"
        self.pending_marker = self.state_dir / "pending.json"

    def installed(self):
        try:
            return json.loads(self.installed_marker.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return None

    def _git(self, *args, check=True):
        return self.runner(["git", "-C", str(self.repo_dir), *args], check=check,
                           stdout=subprocess.PIPE, stderr=subprocess.PIPE)

    def _object(self, commit, path):
        result = self._git("show", commit + ":" + path)
        return result.stdout

    def stage(self, manifest):
        manifest = validate_manifest(manifest)
        current = self.installed() or {}
        if current.get("releaseId") == manifest["releaseId"] and current.get("serverCommit") == manifest["serverCommit"]:
            return None
        self._git("fetch", "--quiet", "origin", manifest["serverCommit"])
        self._git("cat-file", "-e", manifest["serverCommit"] + "^{commit}")
        self.state_dir.mkdir(parents=True, exist_ok=True)
        staging = Path(tempfile.mkdtemp(prefix="stage-", dir=self.state_dir))
        backup = Path(tempfile.mkdtemp(prefix="backup-", dir=self.state_dir))
        try:
            for item in manifest["piFiles"]:
                content = self._object(manifest["serverCommit"], item["path"])
                if sha256_bytes(content) != item["sha256"]:
                    raise ReleaseError("hash mismatch for " + item["path"])
                target = staging / item["path"]
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(content)
                if target.suffix == ".py":
                    py_compile.compile(str(target), doraise=True)
                existing = self.repo_dir / item["path"]
                if existing.exists():
                    saved = backup / item["path"]
                    saved.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copy2(existing, saved)
            existing_paths = [item["path"] for item in manifest["piFiles"]
                              if (backup / item["path"]).exists()]
            pending = {**manifest, "backupDir": str(backup), "stagingDir": str(staging),
                       "previous": current or None, "existingPaths": existing_paths,
                       "startedAt": int(self.now())}
            self._write_json(self.pending_marker, pending)
            return pending
        except Exception:
            shutil.rmtree(staging, ignore_errors=True)
            shutil.rmtree(backup, ignore_errors=True)
            raise

    def install_staged(self, pending):
        for item in pending["piFiles"]:
            source = Path(pending["stagingDir"]) / item["path"]
            target = self.repo_dir / item["path"]
            target.parent.mkdir(parents=True, exist_ok=True)
            os.replace(source, target)
        return pending

    def confirm(self, pending):
        marker = {"releaseId": pending["releaseId"], "serverCommit": pending["serverCommit"],
                  "installedAt": int(self.now()), "piFiles": pending["piFiles"]}
        self._write_json(self.installed_marker, marker)
        self._clear_pending(pending)
        return marker

    def rollback(self, pending=None, reason="health check failed"):
        pending = pending or self._read_pending()
        if not pending:
            return None
        backup = Path(pending["backupDir"])
        tracks_existing_paths = "existingPaths" in pending
        existing_paths = set(pending.get("existingPaths", []))
        for item in pending["piFiles"]:
            saved = backup / item["path"]
            target = self.repo_dir / item["path"]
            if saved.exists():
                target.parent.mkdir(parents=True, exist_ok=True)
                temporary = target.with_suffix(target.suffix + ".rollback")
                shutil.copy2(saved, temporary)
                os.replace(temporary, target)
            elif tracks_existing_paths and item["path"] not in existing_paths and target.exists():
                target.unlink()
        previous = pending.get("previous")
        if previous:
            self._write_json(self.installed_marker, previous)
        elif self.installed_marker.exists():
            self.installed_marker.unlink()
        self._clear_pending(pending)
        return {"rolledBack": True, "reason": reason, "releaseId": pending["releaseId"]}

    def _read_pending(self):
        try:
            return json.loads(self.pending_marker.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return None

    def _clear_pending(self, pending):
        if self.pending_marker.exists():
            self.pending_marker.unlink()
        shutil.rmtree(pending.get("stagingDir", ""), ignore_errors=True)
        shutil.rmtree(pending.get("backupDir", ""), ignore_errors=True)

    @staticmethod
    def _write_json(path, value):
        path.parent.mkdir(parents=True, exist_ok=True)
        temporary = path.with_suffix(path.suffix + ".tmp")
        temporary.write_text(json.dumps(value, sort_keys=True) + "\n", encoding="utf-8")
        os.replace(temporary, path)
