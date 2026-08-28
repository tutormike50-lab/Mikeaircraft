#!/usr/bin/env python3
import asyncio
import time
import virtual_hill_local as tracker


def run_once():
    asyncio.run(tracker.main())


if __name__ == "__main__":
    print("VIRTUAL HILL - CONTINUOUS MODE", flush=True)
    print("After each aircraft, the tracker will automatically wait for the next one.", flush=True)

    while True:
        try:
            run_once()
        except KeyboardInterrupt:
            print("Stopped by user.", flush=True)
            break
        except Exception as error:
            print("Continuous tracker recovered from:", type(error).__name__, str(error), flush=True)

        print("Waiting 3 seconds, then looking for the next aircraft...", flush=True)
        try:
            time.sleep(3)
        except KeyboardInterrupt:
            print("Stopped by user.", flush=True)
            break
