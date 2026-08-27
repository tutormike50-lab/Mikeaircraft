#!/bin/sh
set -eu

TOKEN="${1:-}"
if [ -z "$TOKEN" ]; then
  echo "MikeAircraft token required" >&2
  exit 2
fi

install -d -m 700 /etc/mikeaircraft
printf '%s' "$TOKEN" > /etc/mikeaircraft/pi-feed-token
chmod 600 /etc/mikeaircraft/pi-feed-token

cat > /usr/local/bin/mikeaircraft-pi-feed <<'EOF'
#!/bin/sh
set -u
URL="https://mikeaircraft.vercel.app/api/pi-ingest"
TOKEN_FILE="/etc/mikeaircraft/pi-feed-token"
DATA_FILE="/run/dump1090-mutability/aircraft.json"

while true; do
  if [ -s "$DATA_FILE" ] && [ -s "$TOKEN_FILE" ]; then
    TOKEN="$(cat "$TOKEN_FILE")"
    wget -qO- --timeout=10 \
      --header="X-MikeAircraft-Token: $TOKEN" \
      --header="Content-Type: application/json" \
      --post-file="$DATA_FILE" \
      "$URL" >/dev/null 2>&1 || true
  fi
  sleep 2
done
EOF
chmod 755 /usr/local/bin/mikeaircraft-pi-feed

cat > /etc/systemd/system/mikeaircraft-pi-feed.service <<'EOF'
[Unit]
Description=MikeAircraft Raspberry Pi ADS-B feed
After=network-online.target dump1090-mutability.service
Wants=network-online.target

[Service]
Type=simple
ExecStart=/usr/local/bin/mikeaircraft-pi-feed
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now mikeaircraft-pi-feed.service
sleep 4
systemctl is-active mikeaircraft-pi-feed.service
