#!/usr/bin/env bash
set -Eeuo pipefail

TARGET_COMMIT="ec9b423587464695b089411b8ce77732440b112b"
REPO_DIR="${MIKEAIRCRAFT_SOURCE_REPO:-/home/mike/MikeAircraft}"
INSTALL_DIR="/opt/mikeaircraft"
CONFIG_DIR="/etc/mikeaircraft"
ENV_FILE="${CONFIG_DIR}/pi-bridge.env"
BRIDGE_SERVICE="mikeaircraft-pi-bridge.service"
LINK_SERVICE="mikeaircraft-link-v2.service"
RELEASE_TIMER="mikeaircraft-release-agent.timer"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP_DIR="/var/backups/mikeaircraft/pre-ec9-${STAMP}"
STAGE_DIR="$(mktemp -d /opt/mikeaircraft-ec9-stage.XXXXXX)"
MANIFEST="$(mktemp /tmp/mikeaircraft-ec9-manifest.XXXXXX)"
OLD_INSTALL=""
ACTIVATION_STARTED=0

cleanup() {
  rm -f -- "$MANIFEST"
  if [[ -d "$STAGE_DIR" ]]; then
    rm -rf -- "$STAGE_DIR"
  fi
}

rollback_on_error() {
  local exit_code=$?
  trap - ERR
  echo "Rollback activation failed; restoring the pre-install Pi state." >&2
  systemctl stop "$BRIDGE_SERVICE" >/dev/null 2>&1 || true
  if [[ $ACTIVATION_STARTED -eq 1 && -n "$OLD_INSTALL" && -d "$OLD_INSTALL" ]]; then
    rm -rf -- "$INSTALL_DIR"
    mv -- "$OLD_INSTALL" "$INSTALL_DIR"
  fi
  if [[ -f "$BACKUP_DIR/mikeaircraft-pi-bridge.service" ]]; then
    install -m 0644 "$BACKUP_DIR/mikeaircraft-pi-bridge.service" "/etc/systemd/system/$BRIDGE_SERVICE"
  fi
  systemctl daemon-reload >/dev/null 2>&1 || true
  cleanup
  exit "$exit_code"
}

trap cleanup EXIT
trap rollback_on_error ERR

if [[ $EUID -ne 0 ]]; then
  echo "Run this installer with sudo." >&2
  exit 1
fi

for command in git tar sha256sum systemctl systemd-run install find sort xargs; do
  command -v "$command" >/dev/null || {
    echo "Required command is missing: $command" >&2
    exit 1
  }
done

[[ -d "$REPO_DIR/.git" || -f "$REPO_DIR/.git" ]] || {
  echo "MikeAircraft source repository not found at $REPO_DIR" >&2
  exit 1
}
[[ -r "$ENV_FILE" ]] || {
  echo "Existing Pi bridge credentials are missing; nothing was changed." >&2
  exit 1
}
grep -q '^MIKEAIRCRAFT_PI_BRIDGE_TOKEN=.' "$ENV_FILE" || {
  echo "Existing Pi bridge token is missing; nothing was changed." >&2
  exit 1
}
grep -q '^MIKEAIRCRAFT_CONTROL_PIN=.' "$ENV_FILE" || {
  echo "Existing Control PIN is missing; nothing was changed." >&2
  exit 1
}
if grep -Eq 'replace-with-|CHANGE_ME|CHANGEME|<[^>]+>' "$ENV_FILE"; then
  echo "Credential placeholders were found; nothing was changed." >&2
  exit 1
fi

git -C "$REPO_DIR" cat-file -e "${TARGET_COMMIT}^{commit}"
resolved_commit="$(git -C "$REPO_DIR" rev-parse "${TARGET_COMMIT}^{commit}")"
[[ "$resolved_commit" == "$TARGET_COMMIT" ]] || {
  echo "The exact ec9b423 commit is unavailable; nothing was changed." >&2
  exit 1
}

git -C "$REPO_DIR" archive --format=tar "$TARGET_COMMIT" | tar -xf - -C "$STAGE_DIR"
[[ -r "$STAGE_DIR/scripts/pi_bridge.py" ]]
[[ -r "$STAGE_DIR/scripts/production_tracker.py" ]]
[[ -r "$STAGE_DIR/scripts/production_tracking.py" ]]
[[ -r "$STAGE_DIR/scripts/camera_optics.py" ]]
[[ -r "$STAGE_DIR/deploy/pi-bridge/mikeaircraft-pi-bridge.service" ]]

if [[ -e "$STAGE_DIR/scripts/link_v2_agent.py" || -e "$STAGE_DIR/deploy/link-v2" ]]; then
  echo "Link V2 content appeared in the ec9 stage; nothing was changed." >&2
  exit 1
fi

/usr/bin/python3 -m py_compile \
  "$STAGE_DIR/scripts/pi_bridge.py" \
  "$STAGE_DIR/scripts/production_tracker.py" \
  "$STAGE_DIR/scripts/production_tracking.py" \
  "$STAGE_DIR/scripts/camera_optics.py"
/usr/bin/python3 -c 'import bleak' >/dev/null

(
  cd "$STAGE_DIR"
  find . -type f ! -path '*/__pycache__/*' -print0 | sort -z | xargs -0 sha256sum >"$MANIFEST"
)

echo "Preflight: authenticating the exact ec9 bridge against Production without starting tracking."
systemd-run --wait --pipe --collect --quiet \
  --unit=mikeaircraft-ec9-preflight \
  --property="EnvironmentFile=$ENV_FILE" \
  --property="WorkingDirectory=$STAGE_DIR" \
  /usr/bin/python3 "$STAGE_DIR/scripts/pi_bridge.py" --check-auth

install -d -m 0700 "$BACKUP_DIR"
if [[ -d "$INSTALL_DIR" ]]; then
  tar -C /opt -czf "$BACKUP_DIR/opt-mikeaircraft.tar.gz" mikeaircraft
fi
tar -C /etc -czf "$BACKUP_DIR/etc-mikeaircraft.tar.gz" mikeaircraft
if [[ -f "/etc/systemd/system/$BRIDGE_SERVICE" ]]; then
  cp -a -- "/etc/systemd/system/$BRIDGE_SERVICE" "$BACKUP_DIR/mikeaircraft-pi-bridge.service"
fi
systemctl status "$BRIDGE_SERVICE" --no-pager >"$BACKUP_DIR/bridge-status-before.txt" 2>&1 || true
systemctl status "$LINK_SERVICE" --no-pager >"$BACKUP_DIR/link-v2-status-before.txt" 2>&1 || true
sha256sum "$BACKUP_DIR"/*.tar.gz >"$BACKUP_DIR/SHA256SUMS"

echo "Activation: stopping newer communication services after all preflight checks passed."
systemctl disable --now "$LINK_SERVICE" >/dev/null 2>&1 || true
systemctl disable --now "$RELEASE_TIMER" >/dev/null 2>&1 || true
systemctl stop "$BRIDGE_SERVICE" >/dev/null 2>&1 || true

if ! id mikeaircraft >/dev/null 2>&1; then
  useradd --system --home-dir "$INSTALL_DIR" --shell /usr/sbin/nologin mikeaircraft
fi

rm -rf -- "$STAGE_DIR/__pycache__" "$STAGE_DIR/scripts/__pycache__"
chown -R mikeaircraft:mikeaircraft "$STAGE_DIR"
install -d -m 0755 -o mikeaircraft -g mikeaircraft "$STAGE_DIR/var/log"

ACTIVATION_STARTED=1
if [[ -d "$INSTALL_DIR" ]]; then
  OLD_INSTALL="/opt/mikeaircraft.pre-ec9-${STAMP}"
  mv -- "$INSTALL_DIR" "$OLD_INSTALL"
fi
mv -- "$STAGE_DIR" "$INSTALL_DIR"
STAGE_DIR=""

(
  cd "$INSTALL_DIR"
  sha256sum -c "$MANIFEST" >/dev/null
)

install -m 0644 "$INSTALL_DIR/deploy/pi-bridge/mikeaircraft-pi-bridge.service" "/etc/systemd/system/$BRIDGE_SERVICE"
systemctl daemon-reload
systemctl enable "$BRIDGE_SERVICE" >/dev/null
systemctl restart "$BRIDGE_SERVICE"
systemctl is-active --quiet "$BRIDGE_SERVICE"
systemctl is-enabled --quiet "$BRIDGE_SERVICE"
if systemctl is-active --quiet "$LINK_SERVICE"; then
  echo "Link V2 unexpectedly became active." >&2
  exit 1
fi

installed_hash="$(sha256sum "$INSTALL_DIR/scripts/pi_bridge.py" | awk '{print $1}')"
expected_hash="$(git -C "$REPO_DIR" show "$TARGET_COMMIT:scripts/pi_bridge.py" | sha256sum | awk '{print $1}')"
[[ "$installed_hash" == "$expected_hash" ]]

trap - ERR
echo
echo "MIKEAIRCRAFT_EC9_ROLLBACK_READY"
echo "commit=$TARGET_COMMIT"
echo "bridge=active"
echo "link_v2=inactive"
echo "backup=$BACKUP_DIR"
echo "Next: open Direct Tracker, click one aircraft, and confirm smooth RS4 tracking."
