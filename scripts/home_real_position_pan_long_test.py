#!/usr/bin/env python3
import asyncio
import home_real_position_pan_test as test

test.TRACK_SECONDS = 75.0

if __name__ == "__main__":
    asyncio.run(test.main())
