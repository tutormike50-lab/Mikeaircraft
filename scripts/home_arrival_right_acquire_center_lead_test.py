#!/usr/bin/env python3
import asyncio
import builtins
import time

import home_real_position_pan_tilt_stable_hybrid_test as stable
import home_real_position_pan_tilt_resilient_test as resilient

# Home-window arrival acceptance test:
#   HOME -> only accept an inbound while it is on the RIGHT side of Hornbach
#   -> smooth filtered tracking with a small rate-based lead so the aircraft
#   stays centred when zoomed -> keep following through visual obstructions
#   -> touchdown -> exact proven Hornbach HOME.
#
# The proven stable movement speeds and exact HOME controller are unchanged.

ARRIVAL_STATES = {"APPROACHING", "ON_FINAL"}
RIGHT_MIN_DEG = 5.0
RIGHT_MAX_DEG = 30.0
LEAD_SECONDS = 0.90
MAX_LEAD_DEG = 1.20
RATE_ALPHA = 0.18
MAX_RATE_DEG_S = 4.0

stable.MAX_TRACK_SECONDS = 300.0

_original_ribbon_current = stable.ribbon_current
_original_target = resilient.resilient_target
_original_smooth_angle = stable.smooth_angle
_locked_arrival = None
_touchdown_reported = False

# Separate filter state so the lead does not feed back into the next smoothing step.
_filter_value = None
_last_raw_bearing = None
_last_raw_time = None
_rate_ema = 0.0


def _clean_callsign(value):
    return str(value or "").strip().upper().replace(" ", "")


def centred_smooth_angle(previous, new_value, alpha):
    """Stable bearing filter plus a small, heavily smoothed motion lead."""
    global _filter_value, _last_raw_bearing, _last_raw_time, _rate_ema

    now = time.monotonic()

    if _filter_value is None:
        _filter_value = stable.wrap180(new_value)
    else:
        _filter_value = stable.wrap180(
            _filter_value + alpha * stable.angle_error(new_value, _filter_value)
        )

    if _last_raw_bearing is not None and _last_raw_time is not None:
        dt = now - _last_raw_time
        if 0.08 <= dt <= 2.0:
            delta = stable.angle_error(new_value, _last_raw_bearing)
            instant_rate = delta / dt
            instant_rate = max(-MAX_RATE_DEG_S, min(MAX_RATE_DEG_S, instant_rate))
            _rate_ema += RATE_ALPHA * (instant_rate - _rate_ema)

    _last_raw_bearing = stable.wrap180(new_value)
    _last_raw_time = now

    lead = max(-MAX_LEAD_DEG, min(MAX_LEAD_DEG, _rate_ema * LEAD_SECONDS))
    return stable.wrap180(_filter_value + lead)


def right_side_arrival_ribbon(engine):
    """Accept CURRENT only when the inbound is still to the right of HOME."""
    global _locked_arrival

    if _locked_arrival is not None:
        return dict(_locked_arrival)

    current = _original_ribbon_current(engine)
    if not current:
        return None

    state = str(current.get("state") or "").upper()
    if state not in ARRIVAL_STATES:
        return None

    try:
        target = _original_target(current)
    except Exception:
        target = None

    if not target:
        print("Arrival CURRENT found - waiting for fresh position...", flush=True)
        return None

    relative_pan = stable.wrap180(target["bearing"] - stable.geom.REFERENCE_BEARING_DEG)

    if not (RIGHT_MIN_DEG <= relative_pan <= RIGHT_MAX_DEG):
        side = "LEFT/late" if relative_pan < RIGHT_MIN_DEG else "too far RIGHT"
        print(
            f"Arrival {target['callsign']} is {relative_pan:+.1f} deg from HOME ({side}) - "
            "waiting for an inbound in the right-side acquisition zone.",
            flush=True,
        )
        return None

    _locked_arrival = dict(current)
    print(
        f"ARRIVAL ACCEPTED: {target['callsign']} {state} at {relative_pan:+.1f} deg RIGHT of HOME, "
        f"{target['distance']:.1f} km from camera - committed through touchdown.",
        flush=True,
    )
    return dict(_locked_arrival)


def _is_selected(ac, selection):
    hx = stable.clean_hex(ac.get("hex") or ac.get("id"))
    wanted_hex = stable.clean_hex(selection.get("hex") or selection.get("id"))
    if hx and wanted_hex and hx == wanted_hex:
        return True

    call = _clean_callsign(ac.get("flight") or ac.get("callsign"))
    wanted_call = _clean_callsign(selection.get("callsign"))
    return bool(call and wanted_call and call == wanted_call)


def _selected_is_ground(selection):
    try:
        feed = stable.geom.local.read_local_feed()
        for ac in feed.get("aircraft") or []:
            if not _is_selected(ac, selection):
                continue
            if ac.get("alt_baro") == "ground" or ac.get("alt_geom") == "ground":
                return True
            return False
    except Exception:
        pass

    try:
        engine = stable.geom.base.fetch_engine()
        for ac in engine.get("aircraft") or []:
            if not _is_selected(ac, selection):
                continue
            state = str(ac.get("state") or "").upper()
            if ac.get("onGround") is True or state in {"LANDED", "TAXIING_IN"}:
                return True
            return False
    except Exception:
        pass

    return False


def full_arrival_target(selection):
    global _touchdown_reported

    if _selected_is_ground(selection):
        if not _touchdown_reported:
            print(
                f"TOUCHDOWN CONFIRMED: {selection.get('callsign') or selection.get('hex')} - "
                "holding landing position briefly, then HOME.",
                flush=True,
            )
            _touchdown_reported = True
        return None

    return _original_target(selection)


# Patch selection/filtering only. Proven pan/tilt speeds and exact HOME remain untouched.
stable.ribbon_current = right_side_arrival_ribbon
stable.smooth_angle = centred_smooth_angle
resilient.resilient_target = full_arrival_target

# Replace only the old banner text so the PowerShell output describes this test correctly.
_original_print = builtins.print


def _test_print(*args, **kwargs):
    if args and str(args[0]).startswith("No predictive lead in this test"):
        args = ("Gentle filtered centre lead enabled; proven HOME controller unchanged.",) + args[1:]
    return _original_print(*args, **kwargs)


if __name__ == "__main__":
    print("RIGHT-SIDE FULL ARRIVAL TEST - ACQUIRE RIGHT -> CENTRED LEFT TRACK -> TOUCHDOWN -> HOME", flush=True)
    print("Only arrivals between +5 and +30 degrees right of Hornbach HOME are accepted.", flush=True)
    print("Small smoothed motion lead is enabled to stop the aircraft slipping out of the LEFT edge when zoomed.", flush=True)
    builtins.print = _test_print
    try:
        asyncio.run(stable.main())
    finally:
        builtins.print = _original_print
