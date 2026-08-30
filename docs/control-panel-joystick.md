# Control-panel framing joystick — v1

## Status and scope

The panel, API and Pi integration are implemented. Offline tests use fake
Bluetooth, aircraft data, Redis and browser elements. They do **not** demonstrate
physical direction, smoothness, framing accuracy, zoom performance or production
network latency. No Pi deployment, physical movement or calibration was performed
while building this feature. A supervised hardware acceptance test is still required.

The existing `/api/control` panel has a touch/mouse joystick, arrow-key/direction
buttons, Fine/Normal sensitivity, accepted pan/tilt corrections, current aircraft,
connection status and REQUEST STOP. Existing airport, priority, location and PIN
controls are retained. No overlay, aircraft selection, ADS-B feed or settings API
was changed.

The joystick adjusts framing during TRACKING, not initial HOME alignment. A new
run starts with zero correction. Corrections are limited to ±5° per axis and
0.25° per request, with one outstanding correction. Release retains the last
accepted offset; a small in-flight correction may settle after release. Fine
and Normal request rates are nominally 0.2 and 0.8°/s, bounded by acknowledgement
latency. This cloud-mediated link is not guaranteed to behave like a local
physical joystick. The original motor deadbands and telemetry resolution still
limit the smallest visible adjustment.

No camera video is supplied to the panel. Readouts mean “accepted into the
controller's aim,” not “aircraft visually centred.” An operator checks the image.

## Why this is a separate tracker

`scripts/tower_joystick_v1.py` is a new entry point. It does not overwrite
`tower_reference_calibration_v2.py` or any of the six reviewed Pi helpers. It
retains the v2.1 immutable HOME and stop-only reconnect policy, and finishes
validation of the previously unshipped independent aircraft-polling change.
Aircraft HTTP lookups now run independently of the 50 ms motor loop. This fixes
the reproduced command-starvation defect, but does not prove that it fixes the
physical telemetry outages observed on 30 August.

`scripts/control_panel_trim.py` uses one background HTTPS thread. Only the main
guarded motor loop applies accepted offsets, after converting right/up to this
rig's yaw/pitch convention. The thread cannot send motor packets. Corrections
are added to tracking targets only, never to captured HOME or return targets.
The original pan/elevation limits are checked after applying a trim.

Camera coordinates and altitude still come from the six reviewed Pi helpers.
The panel's saved browser location is **not** silently substituted. After moving
the kit, verify actual camera location/altitude and establish fresh visual HOME;
old telemetry angles are not absolute destinations. This feature does not add
full lens calibration, a zoom model or altitude-datum conversion.

## Security, freshness and failures

- Every GET/POST to `/api/gimbal-control` requires the existing private control
  PIN in `X-MikeAircraft-Control-Pin`. There is no open CORS policy or PIN in a
  URL. The Pi prompts for this PIN in a hidden terminal; it is not the SSH password.
- The API uses the existing Redis configuration, in a separate session-only key.
  Atomic compare-and-set prevents lost updates between the Pi and panel. No
  persistent broadcast setting or stored HOME is edited.
- A Pi run creates a random session ID; another live controller cannot replace
  it. Session freshness expires after three seconds. Old sessions never resume.
- The Pi reports telemetry age, command-tick age, mode and accepted revision.
  Trim stays disabled unless tracking is active, telemetry is at most one second
  old, control ticks are at most half a second old, and pointing error is within
  2° on both axes. This prevents hiding a large acquisition/motor failure as trim.
- Corrections carry an absolute value, a revision and a maximum 1.5-second
  validity window. The Pi subtracts HTTP round-trip time from this window and
  checks a monotonic deadline before accepting. No held velocity stream or
  unbounded command queue exists. Rejected/expired commands do not accumulate.
- Releasing, cancelling, losing focus, hiding the page or losing connectivity
  stops new joystick input. Returning to a hidden page requires reconnecting.
  Closing the panel alone does not end otherwise healthy automatic tracking.
- Loss of the Pi-to-panel link ends the physical run through the existing safety
  latch, without automatic HOME. The BLE/telemetry watchdog remains 1.5 seconds.
- REQUEST STOP latches a request for the Pi to stop; it is **not** a hardware
  emergency stop and cannot guarantee delivery over failed Wi-Fi/Bluetooth.
  Keep the physical stop/power accessible. No automatic restart after faults.
- The panel and Pi generate polling traffic only while explicitly connected or
  running. This uses the existing Vercel/Redis services; normal usage charges can
  apply. No additional service/subscription was provisioned.

## Pi handoff (equipment can stay packed away until ready)

1. Put the two new, uniquely named Python files beside the existing six helpers
   in `/home/mike`. Do not replace the older tracker or helpers. Source files are
   under `scripts/` in the same repository as the panel.
2. Safe preflight, with no Bluetooth/network/motion:

   ```powershell
   ssh mike@192.168.1.43 "python3 -B /home/mike/tower_joystick_v1.py --check"
   ```

   This must confirm the six helper hashes. If they differ, stop and review the
   actual installed files; do not bypass the hash check.
3. Only when the kit is set up, balanced, clear to move, and the radar reference
   is visually centred at the selected zoom, a supervised run can be started:

   ```powershell
   ssh -t mike@192.168.1.43 "python3 -B /home/mike/tower_joystick_v1.py --track-one --radar-centred"
   ```

   It requires typing `CENTRED` and entering the **control-panel PIN** privately.
   No PIN belongs in the pasted command. If a hidden terminal is unavailable,
   the program exits before Bluetooth instead of echoing the PIN.
4. Open the existing control panel, enter its private PIN and select CONNECT
   JOYSTICK. While waiting/acquiring it stays disabled. Once ready, verify one
   short Fine adjustment in each axis while watching the camera. If direction,
   latency or motion is wrong, stop; do not compensate with repeated blind nudges.
5. Verify release retains the correction, the next tracking samples keep it,
   REQUEST STOP ends motion, and a normal completed track returns to the original
   visual HOME. A safety fault deliberately does not return HOME. Record the
   timestamped log instead of repeated screenshots.

One-aircraft testing remains intentional. A correction is not automatically
transferred to another run, camera mounting or zoom. Consistency across aircraft
must be established before adding cross-run calibration persistence.

## Offline verification

```sh
node --test tests/*.test.js
python -B -m unittest discover -s tests -p 'test_*.py' -v
python -B scripts/tower_joystick_v1.py --check --controller-dir tests/calibration_test_fixtures
```

The fixtures preserve the six exact reviewed Pi file hashes. No production PIN,
Redis credential, aircraft request or Bluetooth connection is needed for tests.
