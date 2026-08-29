#!/usr/bin/env python3
import asyncio
import home_real_position_pan_test as test

# Keep the proven real-position / Hornbach geometry exactly unchanged.
test.TRACK_SECONDS = 75.0

# At long zoom, the old 1.5 degree tolerance is far too wide.
test.PAN_TOLERANCE_DEG = 0.35


def precision_pan_command(error):
    magnitude = abs(error)
    if magnitude <= test.PAN_TOLERANCE_DEG:
        return 0
    if magnitude > 60:
        speed = 220
    elif magnitude > 30:
        speed = 180
    elif magnitude > 15:
        speed = 140
    elif magnitude > 7:
        speed = 100
    elif magnitude > 3:
        speed = 70
    elif magnitude > 1:
        speed = 45
    else:
        speed = 30
    return speed if error > 0 else -speed


test.pan_command = precision_pan_command

if __name__ == "__main__":
    print("PRECISION PAN TEST: 0.35 degree target tolerance", flush=True)
    print("No predictive lead yet. Proving exact bearing first.", flush=True)
    asyncio.run(test.main())
