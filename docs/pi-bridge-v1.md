# Pi Bridge V1

The bridge makes outbound HTTPS requests every two seconds. It sends only tracker
state, optional aircraft/RS4 labels, and faults; it never sends video or bulk logs.
The browser changes a Redis-backed desired state through its existing signed
control session. The Pi is the only component that starts or stops the production
tracker.

## Vercel setup

Generate one random secret and add it as `MIKEAIRCRAFT_PI_BRIDGE_TOKEN` in the
Vercel project for Production. Redeploy after adding it. The same value is placed
only in the Pi environment file. Existing Redis variables and
`MIKEAIRCRAFT_CONTROL_PIN` remain required.

## One-time Pi installation

Run these after Mission Control has pushed and deployed this commit. These steps
intentionally do not run automatically from development:

```sh
sudo useradd --system --home /opt/mikeaircraft --shell /usr/sbin/nologin mikeaircraft 2>/dev/null || true
sudo mkdir -p /opt/mikeaircraft /etc/mikeaircraft /opt/mikeaircraft/var/log
sudo cp -a /path/to/checked-out/MikeAircraft/. /opt/mikeaircraft/
sudo chown -R mikeaircraft:mikeaircraft /opt/mikeaircraft
sudo install -m 0644 /opt/mikeaircraft/deploy/pi-bridge/mikeaircraft-pi-bridge.service /etc/systemd/system/mikeaircraft-pi-bridge.service
sudo install -m 0600 /opt/mikeaircraft/deploy/pi-bridge/pi-bridge.env.example /etc/mikeaircraft/pi-bridge.env
sudoedit /etc/mikeaircraft/pi-bridge.env
sudo systemctl daemon-reload
sudo systemctl enable --now mikeaircraft-pi-bridge.service
sudo systemctl status --no-pager mikeaircraft-pi-bridge.service
```

Replace `/path/to/checked-out/MikeAircraft` and both placeholder secrets before
enabling. The Pi needs Python 3 plus the production tracker's existing runtime
dependencies (including Bleak). Logs remain in `/opt/mikeaircraft/var/log`.

STOP sends SIGINT to let the production tracker's existing neutral/disconnect
cleanup run, waits 12 seconds, then escalates only if the process is stuck. A
tracker crash is latched as `FAULT`; it is not restarted until the operator sends
STOP and then a new START command.
