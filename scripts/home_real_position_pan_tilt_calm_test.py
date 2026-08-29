#!/usr/bin/env python3
import asyncio
import home_real_position_pan_tilt_smooth_center_test as smooth

# Keep the proven smooth pan and all real HOME geometry unchanged.
# Calm only the vertical controller so it does not hunt up/down around target.
smooth.TILT_DEADBAND = 0.65

_original_axis_speed = smooth.axis_speed


def calm_axis_speed(error, deadband, max_speed):
    # Pan remains exactly as in the proven smooth-centre test.
    if max_speed != 65:
        return _original_axis_speed(error, deadband, max_speed)

    # Tilt: larger settle zone and much gentler minimum movement.
    magnitude = abs(error)
    if magnitude <= deadband:
        return 0
    speed = int(6 + min(24, magnitude * 5.0))
    return speed if error > 0 else -speed


smooth.axis_speed = calm_axis_speed

if __name__ == "__main__":
    print("CALM TILT TEST: smooth pan unchanged, vertical hunting reduced", flush=True)
    asyncio.run(smooth.main())
