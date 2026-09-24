#!/usr/bin/env bash
set -euo pipefail

SERVICE="mikeaircraft-link-v2.service"
ROOT="/opt/mikeaircraft-link-v2"
RELEASES="$ROOT/releases"
CURRENT="$ROOT/current"
PREVIOUS="$ROOT/previous"

if [[ $EUID -ne 0 ]]; then
  echo "Run rollback with sudo." >&2
  exit 1
fi
if [[ ! -L "$PREVIOUS" ]]; then
  echo "No previous Link V2 release is recorded. Disable V2 with: systemctl disable --now $SERVICE" >&2
  exit 1
fi
target="$(readlink -f -- "$PREVIOUS")"
case "$target" in
  "$RELEASES"/*) ;;
  *) echo "Refusing rollback target outside $RELEASES: $target" >&2; exit 1 ;;
esac
(cd "$target" && sha256sum --check --strict deploy/link-v2/release.sha256)
systemctl stop "$SERVICE"
ln -sfn -- "$target" "$ROOT/.current-rollback"
mv -Tf -- "$ROOT/.current-rollback" "$CURRENT"
systemctl start "$SERVICE"
systemctl is-active --quiet "$SERVICE"
echo "Rolled Link V2 back to $target. Bridge V1 remains disabled and unchanged."
