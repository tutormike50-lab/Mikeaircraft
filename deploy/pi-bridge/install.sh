#!/usr/bin/env bash
set -euo pipefail

SERVICE_NAME="mikeaircraft-pi-bridge.service"
SERVICE_USER="mikeaircraft"
INSTALL_DIR="/opt/mikeaircraft"
CONFIG_DIR="/etc/mikeaircraft"
ENV_FILE="${CONFIG_DIR}/pi-bridge.env"
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
SOURCE_DIR="$(cd -- "${SCRIPT_DIR}/../.." && pwd -P)"
FORCE=0
CREDENTIALS_ONLY=0
TEMP_ENV=""

usage() {
  cat <<'EOF'
Usage: sudo bash deploy/pi-bridge/install.sh [--force] [--credentials-only]

  --force             Replace an existing credential file without confirmation.
  --credentials-only  Update credentials and restart the installed service only.
EOF
}

for argument in "$@"; do
  case "$argument" in
    --force) FORCE=1 ;;
    --credentials-only) CREDENTIALS_ONLY=1 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $argument" >&2; usage >&2; exit 2 ;;
  esac
done

if [[ $EUID -ne 0 ]]; then
  echo "Please run this installer with sudo." >&2
  exit 1
fi

if [[ $CREDENTIALS_ONLY -eq 1 ]] && ! systemctl cat "$SERVICE_NAME" >/dev/null 2>&1; then
  echo "The bridge is not installed yet; run this installer without --credentials-only." >&2
  exit 1
fi

cleanup() {
  if [[ -n "$TEMP_ENV" && -f "$TEMP_ENV" ]]; then
    rm -f -- "$TEMP_ENV"
  fi
}
trap cleanup EXIT HUP INT TERM

env_has_real_credentials() {
  [[ -f "$ENV_FILE" ]] || return 1
  grep -q '^MIKEAIRCRAFT_PI_BRIDGE_TOKEN=.' "$ENV_FILE" || return 1
  grep -q '^MIKEAIRCRAFT_CONTROL_PIN=.' "$ENV_FILE" || return 1
  ! grep -Eq 'replace-with-|CHANGE_ME|CHANGEME|<[^>]+>' "$ENV_FILE"
}

if env_has_real_credentials && [[ $FORCE -ne 1 ]]; then
  read -r -p "Real bridge credentials already exist. Replace them? [y/N] " answer
  case "$answer" in
    y|Y|yes|YES) ;;
    *) echo "Kept the existing credentials. Nothing changed."; exit 0 ;;
  esac
fi

echo "Paste the NEW Vercel bridge token, then press Enter. (The token will be visible while you paste.)"
IFS= read -r bridge_token
if [[ -z "$bridge_token" ]]; then
  echo "Bridge token cannot be empty." >&2
  exit 1
fi

echo "Type or paste the existing Control PIN, then press Enter. Input is being accepted but hidden."
IFS= read -r -s control_pin
echo
if [[ -z "$control_pin" ]]; then
  echo "Control PIN cannot be empty." >&2
  exit 1
fi

install -d -m 0755 "$CONFIG_DIR"
TEMP_ENV="$(mktemp "${CONFIG_DIR}/pi-bridge.env.tmp.XXXXXX")"
chmod 0600 "$TEMP_ENV"

quote_env_value() {
  local value="$1"
  printf "'%s'" "${value//\'/\'\\\'\'}"
}

{
  printf 'MIKEAIRCRAFT_BASE_URL=%s\n' "$(quote_env_value 'https://mikeaircraft.vercel.app')"
  printf 'MIKEAIRCRAFT_PI_BRIDGE_TOKEN=%s\n' "$(quote_env_value "$bridge_token")"
  printf 'MIKEAIRCRAFT_CONTROL_PIN=%s\n' "$(quote_env_value "$control_pin")"
  printf 'MIKEAIRCRAFT_REPO_DIR=%s\n' "$(quote_env_value '/opt/mikeaircraft')"
  printf 'MIKEAIRCRAFT_TRACKER_LOG_DIR=%s\n' "$(quote_env_value '/opt/mikeaircraft/var/log')"
} >"$TEMP_ENV"
unset bridge_token control_pin
install -m 0600 -o root -g root "$TEMP_ENV" "$ENV_FILE"
rm -f -- "$TEMP_ENV"
TEMP_ENV=""

if [[ $CREDENTIALS_ONLY -eq 1 ]]; then
  systemctl restart "$SERVICE_NAME"
else
  if ! id "$SERVICE_USER" >/dev/null 2>&1; then
    useradd --system --home-dir "$INSTALL_DIR" --shell /usr/sbin/nologin "$SERVICE_USER"
  fi
  install -d -m 0755 "$INSTALL_DIR" "$INSTALL_DIR/var" "$INSTALL_DIR/var/log"
  if [[ "$SOURCE_DIR" != "$INSTALL_DIR" ]]; then
    cp -a "$SOURCE_DIR/." "$INSTALL_DIR/"
  fi
  chown -R "$SERVICE_USER:$SERVICE_USER" "$INSTALL_DIR"
  install -m 0644 "$INSTALL_DIR/deploy/pi-bridge/mikeaircraft-pi-bridge.service" "/etc/systemd/system/$SERVICE_NAME"
  systemctl daemon-reload
  systemctl enable "$SERVICE_NAME" >/dev/null
  systemctl restart "$SERVICE_NAME"
fi

echo
if systemctl is-active --quiet "$SERVICE_NAME"; then
  echo "Pi bridge installed and running. Setup is complete."
else
  echo "Pi bridge was installed but is not running. Recent status:"
  systemctl status --no-pager --lines=8 "$SERVICE_NAME" || true
  exit 1
fi
