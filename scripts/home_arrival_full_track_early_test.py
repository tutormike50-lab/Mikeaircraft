#!/usr/bin/env python3
import asyncio

import home_real_position_pan_tilt_stable_hybrid_test as stable
import home_real_position_pan_tilt_resilient_test as resilient

# Arrival-only acceptance test for the home window:
#   Hornbach HOME -> acquire inbound to the right -> smooth pan left while
#   descending -> keep following ADS-B even through visual obstructions ->
#   touchdown -> exact Hornbach HOME.
#
# IMPORTANT: the proven stable hybrid movement/HOME controller is unchanged.

ARRIVAL_STATES = {"APPROACHING", "ON_FINAL"}
MIN_ACCEPT_AIRPORT_DISTANCE_KM = 5.5

# Give a full arrival enough time to reach touchdown after entering 12 km.
stable.MAX_TRACK_SECONDS = 300.0

_original_ribbon_current = stable.ribbon_current
_original_target = resilient.resilient_target
_locked_arrival = None
_touchdown_reported = False


def _clean_callsign(value):
    return str(value or "").strip().upper().replace(" ", "")


def arrival_only_ribbon(engine):
    """Latch an arrival only while it is still far enough out for a full test."""
    global _locked_arrival

    if _locked_arrival is not None:
        return dict(_locked_arrival)

    current = _original_ribbon_current(engine)
    if not current:
        return None

    raw_current = (engine.get("intelligence") or {}).get("current") or {}
    state = str(current.get("state") or raw_current.get("state") or "").upper()
    if state not in ARRIVAL_STATES:
        return None

    airport_distance = raw_current.get("distanceKm")
    try:
        airport_distance = float(airport_distance)
    except (TypeError, ValueError):
        airport_distance = None

    if airport_distance is not None and airport_distance < MIN_ACCEPT_AIRPORT_DISTANCE_KM:
        print(
            f"Arrival {current.get('callsign') or current.get('hex')} already too close "
            f"({airport_distance:.1f} km from airport) - waiting for the next inbound.",
            flush=True,
        )
        return None

    _locked_arrival = dict(current)
    print(
        f"ARRIVAL ACCEPTED: {_locked_arrival.get('callsign')} {state} "
        f"{airport_distance:.1f} km from airport - committed through touchdown."
        if airport_distance is not None
        else f"ARRIVAL ACCEPTED: {_locked_arrival.get('callsign')} {state} - committed through touchdown.",
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


stable.ribbon_current = arrival_only_ribbon
resilient.resilient_target = full_arrival_target


if __name__ == "__main__":
    print("FULL EARLY ARRIVAL TEST - RIGHT ACQUIRE -> LEFT TRACK -> DESCEND -> TOUCHDOWN -> HOME", flush=True)
    print("Arrivals already inside 5.5 km from the airport are ignored so we get the full approach.", flush=True)
    print("Proven stable-hybrid movement and exact Hornbach HOME are unchanged.", flush=True)
    asyncio.run(stable.main())
