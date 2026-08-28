#!/usr/bin/env python3
import asyncio
import virtual_hill_tracker as base

ACTIVE_STATES = {
    "APPROACHING",
    "ON_FINAL",
    "TAKEOFF_ROLL",
    "AIRBORNE_DEPARTURE",
    "DEPARTING",
}

sticky_id = None
sticky_hex = None


def state_of(ac, current=None):
    return str(ac.get("state") or (current or {}).get("state") or "").strip().upper()


def active(ac, current=None):
    return state_of(ac, current) in ACTIVE_STATES


def same(ac, target_id, target_hex):
    ac_id = ac.get("id")
    ac_hex = str(ac.get("hex") or "").strip().lower()
    return (target_id and ac_id == target_id) or (target_hex and ac_hex == target_hex)


def choose_target(data):
    global sticky_id, sticky_hex
    aircraft = data.get("aircraft") or []

    if sticky_id or sticky_hex:
        for ac in aircraft:
            if same(ac, sticky_id, sticky_hex):
                if not active(ac):
                    return None
                return base.make_target(ac, None, "LOCKED_ACTIVE")
        return None

    current = (data.get("intelligence") or {}).get("current") or {}
    current_id = current.get("id")
    current_hex = str(current.get("hex") or "").strip().lower()

    if current_id or current_hex:
        for ac in aircraft:
            if same(ac, current_id, current_hex) and active(ac, current):
                target = base.make_target(ac, current, "CURRENT_ACTIVE")
                if target:
                    if target["distance"] <= base.LOCK_RANGE_KM:
                        sticky_id = target["id"]
                        sticky_hex = str(ac.get("hex") or "").strip().lower()
                    return target

    candidates = []
    for ac in aircraft:
        if not active(ac):
            continue
        target = base.make_target(ac, None, "NEAREST_ACTIVE")
        if target:
            candidates.append((target, ac))

    candidates.sort(key=lambda pair: pair[0]["distance"])
    if not candidates:
        return None

    target, ac = candidates[0]
    if target["distance"] <= base.LOCK_RANGE_KM:
        sticky_id = target["id"]
        sticky_hex = str(ac.get("hex") or "").strip().lower()
    return target


base.current_target = choose_target
asyncio.run(base.main())
