#!/usr/bin/env bash
set -euo pipefail

RELEASE_ID="ec9b423-link-v2"
SERVICE="mikeaircraft-link-v2.service"
ROOT="/opt/mikeaircraft-link-v2"
RELEASES="$ROOT/releases"
CURRENT="$ROOT/current"
PREVIOUS="$ROOT/previous"
CONFIG_DIR="/etc/mikeaircraft"
ENV_FILE="$CONFIG_DIR/link-v2.env"
STATE_DIR="/var/lib/mikeaircraft-link-v2"
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
SOURCE_DIR="$(cd -- "$SCRIPT_DIR/../.." && pwd -P)"
TARGET="$RELEASES/$RELEASE_ID"
STAGING=""

if [[ $EUID -ne 0 ]]; then
  echo "Run this release installer with sudo." >&2
  exit 1
fi

cleanup() {
  if [[ -n "$STAGING" && -d "$STAGING" ]]; then
    rm -rf -- "$STAGING"
  fi
}
trap cleanup EXIT HUP INT TERM

# Refuse mixed or edited sources before touching the installed release.
(cd "$SOURCE_DIR" && sha256sum --check --strict deploy/link-v2/release.sha256)
if systemctl is-active --quiet mikeaircraft-pi-bridge.service; then
  echo "Bridge V1 is active. Refusing to start a second tracker owner; disable V1 separately first." >&2
  exit 1
fi

install -d -m 0755 "$RELEASES" "$STATE_DIR" "$STATE_DIR/log" "$CONFIG_DIR"
if ! id mikeaircraft >/dev/null 2>&1; then
  useradd --system --home-dir "$ROOT" --shell /usr/sbin/nologin mikeaircraft
fi

if [[ -e "$TARGET" ]]; then
  (cd "$TARGET" && sha256sum --check --strict deploy/link-v2/release.sha256)
else
  STAGING="$(mktemp -d "$RELEASES/.${RELEASE_ID}.staging.XXXXXX")"
  install -d -m 0755 "$STAGING/scripts" "$STAGING/deploy/link-v2"
  install -m 0755 "$SOURCE_DIR/scripts/link_v2_agent.py" "$STAGING/scripts/"
  install -m 0644 "$SOURCE_DIR/scripts/production_tracker.py" "$STAGING/scripts/"
  install -m 0644 "$SOURCE_DIR/scripts/production_tracking.py" "$STAGING/scripts/"
  install -m 0644 "$SOURCE_DIR/scripts/camera_optics.py" "$STAGING/scripts/"
  install -m 0644 "$SOURCE_DIR/deploy/link-v2/release.sha256" "$STAGING/deploy/link-v2/"
  (cd "$STAGING" && sha256sum --check --strict deploy/link-v2/release.sha256)
  chown -R root:root "$STAGING"
  chmod -R a-w "$STAGING"
  mv -- "$STAGING" "$TARGET"
  STAGING=""
fi

if [[ ! -f "$ENV_FILE" ]]; then
  install -m 0600 -o root -g root "$SOURCE_DIR/deploy/link-v2/link-v2.env.example" "$ENV_FILE"
  echo "Created $ENV_FILE. Replace its V2 placeholder secret, then rerun this installer." >&2
  exit 2
fi
if grep -Eq 'replace-with-|keep-the-existing|CHANGE_ME|CHANGEME' "$ENV_FILE"; then
  echo "$ENV_FILE still contains placeholders; no service was activated." >&2
  exit 2
fi

# Preserve the prior V2 release for a one-command rollback. V1 is never changed.
if [[ -L "$CURRENT" ]]; then
  old_target="$(readlink -f -- "$CURRENT")"
  case "$old_target" in
    "$RELEASES"/*) ln -sfn -- "$old_target" "$PREVIOUS" ;;
    *) echo "Refusing unexpected current release path: $old_target" >&2; exit 1 ;;
  esac
fi
ln -sfn -- "$TARGET" "$ROOT/.current-new"
mv -Tf -- "$ROOT/.current-new" "$CURRENT"

chown -R mikeaircraft:mikeaircraft "$STATE_DIR"
install -m 0644 "$SOURCE_DIR/deploy/link-v2/mikeaircraft-link-v2.service" "/etc/systemd/system/$SERVICE"
systemctl daemon-reload
systemctl enable "$SERVICE" >/dev/null
systemctl restart "$SERVICE"
systemctl is-active --quiet "$SERVICE"
echo "Link V2 release $RELEASE_ID is installed and running. Bridge V1 was not modified."
