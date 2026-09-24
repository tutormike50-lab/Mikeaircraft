# MikeAircraft Link V2 deployment and rollback

Link V2 replaces only the communication path between Direct Tracker and the Pi. It does not replace or modify the tracking engine. The protected `production_tracker.py`, `production_tracking.py`, and `camera_optics.py` files are the exact `ec9b423` versions and are verified by SHA-256 before installation and at service start.

## Architecture

1. Direct Tracker writes the selected ICAO to the existing server-side state.
2. The Pi makes an authenticated outbound `POST /api/link-v2/commands` every two seconds. No inbound Pi port or Work-to-Pi SSH is required.
3. The response is accepted only when `protocolVersion=mikeaircraft-link-v2`, `releaseId=ec9b423-link-v2`, the sequence is monotonic, the identity is consistent, and its short lease is fresh.
4. The agent exposes the accepted selection only on `127.0.0.1:8765/api/direct-tracker`, using the contract the protected tracker already understands.
5. The agent launches the protected tracker with `--track --direct` and the loopback URL. If communication stops, the lease expires and the loopback endpoint returns `STOPPED`; command state is not restored after restart.

The existing Control PIN remains the tracker credential. `MIKEAIRCRAFT_LINK_V2_TOKEN` is a new, independent transport credential and must not reuse or replace the Bridge V1 token.

## Prepare one complete release

On a build machine, use the complete repository tree rather than copying individual files. Run all tests and transfer one archive or Git checkout containing this release. Do not edit `deploy/link-v2/release.sha256` on the Pi.

Before involving the hardware:

```text
npm test
python3 -m unittest tests.test_link_v2_agent -v
python3 scripts/production_tracker.py --check
```

## Install on the Pi

Bridge V1 must already be disabled and inactive. The installer checks this but never stops, enables, edits, or deletes V1.

```text
cd /path/to/coherent-release
sudo bash deploy/link-v2/install.sh
```

On its first run the installer creates `/etc/mikeaircraft/link-v2.env` and exits before activation. Edit that file as root, replacing the placeholders with:

- the deployed base URL;
- a newly generated V2 token matching the server environment;
- the existing Control PIN.

Then rerun the installer. It verifies the release, installs it immutably under `/opt/mikeaircraft-link-v2/releases/ec9b423-link-v2`, switches the `current` symlink atomically, installs the separate `mikeaircraft-link-v2.service`, and starts it. Logs are written under `/var/lib/mikeaircraft-link-v2/log`.

## Software acceptance

Before a physical aircraft test, verify that:

- Link V2 remains active without a restart loop;
- server health reports the expected protocol, release and agent versions;
- tracker state is `RUNNING` and the runtime/source paths are coherent;
- a selected ICAO produces the same command ID and sequence in server health and the Pi journal;
- version mismatch, expired command, loss of network, and agent restart all result in no target on the loopback endpoint.

Do not use START ADJUST, centering, boresight, or joystick calibration during recovery acceptance.

## Physical acceptance

Perform one controlled test with a clear gimbal movement area:

1. Open Direct Tracker and select one aircraft.
2. Confirm its command ID and sequence reached Link V2.
3. Confirm the protected tracker acquires that same ICAO.
4. Observe that the RS4 follows it smoothly.

Only that complete result accepts the release. Until then, retain all Bridge V1 service files, environment files, secrets, logs, backups, and repository history.

## Rollback

For a previous Link V2 release installed by this mechanism:

```text
sudo bash deploy/link-v2/rollback.sh
```

The script verifies the prior release, stops only Link V2, atomically repoints `current`, and restarts Link V2. It never enables Bridge V1.

If there is no prior Link V2 release, disable this replacement without deleting it:

```text
sudo systemctl disable --now mikeaircraft-link-v2.service
```

Do not reactivate or delete Bridge V1 as part of automatic rollback. Any later V1 action requires a separate, explicit recovery decision.
