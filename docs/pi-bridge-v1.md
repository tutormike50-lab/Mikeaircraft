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

After Mission Control has configured the new bridge token in Vercel, run this
single command from the checked-out MikeAircraft repository on the Pi:

```sh
sudo bash deploy/pi-bridge/install.sh
```

The installer asks once for the new bridge token and existing Control PIN, then
installs and starts the service. It does not print either secret after entry. It
preserves real existing credentials unless replacement is confirmed. To rotate
credentials later without reinstalling the checkout, run
`sudo bash deploy/pi-bridge/install.sh --credentials-only` (or add `--force` to
skip the replacement confirmation). The Pi needs Python 3 plus the production
tracker's existing runtime dependencies (including Bleak). Logs remain in
`/opt/mikeaircraft/var/log`.

STOP sends SIGINT to let the production tracker's existing neutral/disconnect
cleanup run, waits 12 seconds, then escalates only if the process is stuck. A
tracker crash is latched as `FAULT`; it is not restarted until the operator sends
STOP and then a new START command.
