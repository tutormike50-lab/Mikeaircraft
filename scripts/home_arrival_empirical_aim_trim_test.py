#!/usr/bin/env python3
import asyncio

import home_arrival_right_acquire_center_lead_test as lead

# Empirical camera/ADS-B alignment trim based on repeated visual tests:
# aircraft has consistently appeared LEFT of the camera aim and the camera
# has aimed too HIGH.  Preserve the proven smooth motion and exact HOME.
PAN_TRIM_DEG = -2.0       # negative = aim further LEFT
ELEV_TRIM_DEG = -1.5      # lower calculated optical elevation = camera aims LOWER

stable = lead.stable
resilient = lead.resilient

_previous_smooth_angle = stable.smooth_angle
_previous_target = resilient.resilient_target


def trimmed_smooth_angle(previous, new_value, alpha):
    aimed = _previous_smooth_angle(previous, new_value, alpha)
    return stable.wrap180(aimed + PAN_TRIM_DEG)


def trimmed_target(selection):
    target = _previous_target(selection)
    if target is None:
        return None
    adjusted = dict(target)
    try:
        adjusted["elevation"] = float(adjusted["elevation"]) + ELEV_TRIM_DEG
    except (TypeError, ValueError, KeyError):
        pass
    return adjusted


stable.smooth_angle = trimmed_smooth_angle
resilient.resilient_target = trimmed_target


if __name__ == "__main__":
    print("HOME ARRIVAL AIM-CALIBRATION TEST", flush=True)
    print("Movement/HOME unchanged. Empirical aim trim: 2.0 deg LEFT, 1.5 deg LOWER.", flush=True)
    print("Waiting for a right-side arrival; judge only whether the aircraft is nearer frame centre.", flush=True)
    asyncio.run(stable.main())
