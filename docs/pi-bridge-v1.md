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

The service uses systemd's `/run/mikeaircraft` runtime directory for its process
lock. systemd creates it with the correct service ownership on every start and
removes it at shutdown, so no manual lock-file creation or ownership fix is
required after installation or reboot.

## One-time Pi installation

After Mission Control has configured the new bridge token in Vercel, run this
single command from the checked-out MikeAircraft repository on the Pi:

```sh
sudo bash deploy/pi-bridge/install.sh
```

The installer asks once for the new bridge token and existing Control PIN, then
installs and starts the service. It does not print either secret after entry. It
preserves real existing credentials unless replacement is confirmed, while still
updating the scripts and service definition. To rotate
credentials later without reinstalling the checkout, run
`sudo bash deploy/pi-bridge/install.sh --credentials-only` (or add `--force` to
skip the replacement confirmation). The Pi needs Python 3 plus the production
tracker's existing runtime dependencies (including Bleak). Logs remain in
`/opt/mikeaircraft/var/log`.

To check authentication without starting the tracker or connecting to BLE, run:

```sh
sudo bash -c 'set -a; source /etc/mikeaircraft/pi-bridge.env; set +a; exec /usr/bin/python3 /opt/mikeaircraft/scripts/pi_bridge.py --check-auth'
```

The check prints only whether a token was loaded, its first 12 SHA-256 hex
characters, the target URL, HTTP status, and whether the dedicated bridge token
was accepted. It never prints the token or Control PIN and does not read or alter
tracker/BLE state. A 401 specifically means the Pi bridge token does not match
the deployed Production `MIKEAIRCRAFT_PI_BRIDGE_TOKEN` (or Production has not
been redeployed since that value was changed).

If that check returns 401 after the code and service update, create one new strong
random token, set it once as the Vercel Production
`MIKEAIRCRAFT_PI_BRIDGE_TOKEN`, redeploy Production, and then run the existing
non-editing credential update from the Pi checkout:

```sh
sudo bash deploy/pi-bridge/install.sh --credentials-only --force
```

Paste that same new token and the existing Control PIN into the hidden prompts,
then rerun `--check-auth`. Do not edit the environment file by hand.

STOP sends SIGINT to let the production tracker's existing neutral/disconnect
cleanup run, waits 12 seconds, then escalates only if the process is stuck. A
tracker crash is latched as `FAULT`; it is not restarted until the operator sends
STOP and then a new START command.
