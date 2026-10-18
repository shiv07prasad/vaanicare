"""Keep the Render free-tier deployment awake by pinging /health every few minutes.

Run:  python scripts/keep_alive.py
Stop: Ctrl+C

Only works while this computer is on and online. Uses the standard library only.
"""
import time
import urllib.error
import urllib.request
from datetime import datetime

URL = "https://vaanicare-klyd.onrender.com/health"
INTERVAL_SECONDS = 5 * 60  # Render sleeps after ~15 min idle, so 5 min leaves plenty of margin
TIMEOUT_SECONDS = 90       # a cold start can take ~50s, so allow time for the wake-up


def ping() -> None:
    started = time.monotonic()
    stamp = datetime.now().strftime("%H:%M:%S")
    try:
        req = urllib.request.Request(URL, headers={"User-Agent": "vaanicare-keep-alive"})
        with urllib.request.urlopen(req, timeout=TIMEOUT_SECONDS) as resp:
            elapsed = time.monotonic() - started
            note = "  (was asleep, woke it up)" if elapsed > 10 else ""
            print(f"[{stamp}] {resp.status} OK in {elapsed:.1f}s{note}", flush=True)
    except urllib.error.HTTPError as e:
        print(f"[{stamp}] HTTP {e.code}: {e.reason}", flush=True)
    except Exception as e:  # network down, DNS, timeout...
        print(f"[{stamp}] failed: {e}", flush=True)


def main() -> None:
    print(f"Pinging {URL} every {INTERVAL_SECONDS // 60} min. Press Ctrl+C to stop.", flush=True)
    try:
        while True:
            ping()
            time.sleep(INTERVAL_SECONDS)
    except KeyboardInterrupt:
        print("\nStopped.")


if __name__ == "__main__":
    main()
