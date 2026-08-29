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

# Give a full arrival enough time to reach touchdown after entering 12 km.
stable.MAX_TRACK_SECONDS = 300.0

_original_ribbon_current = stable.ribbon_current
_original_target = resilient.resilient_target
_locked_arrival = None
_touchdown_reported = False


def _clean_callsign(value):
    return str(value or "").strip().upper().replace(" ", "")


def arrival_only_ribbon(engine):
    """Latch the first ribbon CURRENT that is a real arrival.

    Once latched, keep returning that same aircraft even if the editorial ribbon
    later hands over. The gimbal must finish the physical approach it started.
    """
    global _locked_arrival

    if _locked_arrival is not None:
        return dict(_locked_arrival)

    current = _original_ribbon_current(engine)
    if not current:
        return None

    state = str(current.get("state") or "").upper()
    if state not in ARRIVAL_STATES:
        return None

    _locked_arrival = dict(current)
    print(
        f"ARRIVAL ACCEPTED: {_locked_arrival.get('callsign')} {state} - "
        "this aircraft stays committed through touchdown.",
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
    # Fastest/most direct proof: the Pi's local dump1090 feed.
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

    # Fallback: the authoritative MikeAircraft Pi snapshot.
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
        # The proven stable controller interprets a missing target for four
        # seconds as completion, holds the last commanded position, then HOME.
        return None

    return _original_target(selection)


# Patch selection only. Do not alter the proven pan/tilt/HOME motion controller.
stable.ribbon_current = arrival_only_ribbon
resilient.resilient_target = full_arrival_target


if __name__ == "__main__":
    print("FULL ARRIVAL TEST - RIGHT ACQUIRE -> LEFT TRACK -> DESCEND -> TOUCHDOWN -> HOME", flush=True)
    print("Waiting only for an arrival CURRENT. Visual buildings do not stop ADS-B tracking.", flush=True)
    print("Proven stable-hybrid movement and exact Hornbach HOME are unchanged.", flush=True)
    asyncio.run(stable.main())
