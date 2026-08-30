#!/usr/bin/env python3
import asyncio
import time

import home_real_position_pan_tilt_test as test

# Keep all proven HOME geometry, pan/tilt calibration and safety limits unchanged.
# Only make target matching more resilient:
# 1) local dump1090 hex match
# 2) local dump1090 callsign match
# 3) fresh MikeAircraft Pi snapshot fallback if the local file briefly lacks position

_original_target = test.real_local_target
_engine_cache = {"at": 0.0, "data": None}


def _clean_callsign(value):
    return str(value or "").strip().upper().replace(" ", "")


def _make_target_from_local(ac, selection):
    lat = ac.get("lat")
    lon = ac.get("lon")
    if not isinstance(lat, (int, float)) or not isinstance(lon, (int, float)):
        return None
    if abs(lat) < 1 or abs(lon) < 1:
        return None

    altitude = ac.get("alt_geom")
    if not isinstance(altitude, (int, float)):
        altitude = ac.get("alt_baro")
    if altitude == "ground":
        altitude = test.CAMERA_ALT_M / 0.3048
    if not isinstance(altitude, (int, float)):
        return None

    distance = test.base.haversine_km(test.CAMERA_LAT, test.CAMERA_LON, lat, lon)
    bearing = test.base.bearing_deg(test.CAMERA_LAT, test.CAMERA_LON, lat, lon)
    elevation = test.target_elevation_deg(distance, altitude)
    callsign = str(ac.get("flight") or selection.get("callsign") or selection["hex"]).strip()
    return {
        "callsign": callsign,
        "distance": distance,
        "bearing": bearing,
        "elevation": elevation,
        "altitude": float(altitude),
        "source": "LOCAL_PI",
    }


def _engine_target(selection):
    now = time.monotonic()
    if _engine_cache["data"] is None or now - _engine_cache["at"] > 0.8:
        try:
            _engine_cache["data"] = test.base.fetch_engine()
            _engine_cache["at"] = now
        except Exception:
            return None

    engine = _engine_cache["data"] or {}
    wanted_hex = test.clean_hex(selection.get("hex"))
    wanted_call = _clean_callsign(selection.get("callsign"))

    for ac in engine.get("aircraft") or []:
        same_hex = wanted_hex and test.clean_hex(ac.get("hex") or ac.get("id")) == wanted_hex
        same_call = wanted_call and _clean_callsign(ac.get("callsign")) == wanted_call
        if not (same_hex or same_call):
            continue

        lat = ac.get("lat")
        lon = ac.get("lon")
        altitude = ac.get("altitude")
        position_age = ac.get("positionAge")
        if not isinstance(lat, (int, float)) or not isinstance(lon, (int, float)):
            return None
        if abs(lat) < 1 or abs(lon) < 1:
            return None
        if not isinstance(altitude, (int, float)):
            return None
        if isinstance(position_age, (int, float)) and position_age > 5.0:
            return None

        distance = test.base.haversine_km(test.CAMERA_LAT, test.CAMERA_LON, lat, lon)
        bearing = test.base.bearing_deg(test.CAMERA_LAT, test.CAMERA_LON, lat, lon)
        elevation = test.target_elevation_deg(distance, altitude)
        return {
            "callsign": str(ac.get("callsign") or selection.get("callsign") or selection["hex"]).strip(),
            "distance": distance,
            "bearing": bearing,
            "elevation": elevation,
            "altitude": float(altitude),
            "source": "ENGINE_PI_FALLBACK",
        }
    return None


def resilient_target(selection):
    # First preserve the exact proven hex path.
    try:
        target = _original_target(selection)
        if target:
            target["source"] = "LOCAL_PI"
            return target
    except Exception:
        pass

    # If hex matching fails, try the callsign in the same local dump1090 feed.
    try:
        feed = test.local.read_local_feed()
        wanted_call = _clean_callsign(selection.get("callsign"))
        for ac in feed.get("aircraft") or []:
            if wanted_call and _clean_callsign(ac.get("flight")) == wanted_call:
                target = _make_target_from_local(ac, selection)
                if target:
                    return target
    except Exception:
        pass

    # Last resort: use the fresh authoritative Pi snapshot already in MikeAircraft.
    return _engine_target(selection)


test.real_local_target = resilient_target

if __name__ == "__main__":
    print("RESILIENT RIBBON MATCH: hex -> callsign -> fresh Pi snapshot", flush=True)
    asyncio.run(test.main())
