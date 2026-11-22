"""Claude Code status line that sends subscription quota readings to Aithya."""
import json
import os
import sys
import time
import urllib.error
import urllib.request

WINDOWS = {"five_hour": "5h", "seven_day": "Weekly"}
ENDPOINT = "https://ekqfotmlnqqrbcizjtfz.supabase.co/rest/v1/rpc/sync_studio_claude_credits"
PUBLISHABLE_KEY = "sb_publishable_6L2ejLr3GRiTmy6RZ3juGw__600cspY"


def main():
    token = os.environ.get("AITHYA_CLAUDE_SYNC_TOKEN")
    if not token:
        print("Aithya: add your sync token")
        return
    limits = json.load(sys.stdin).get("rate_limits") or {}
    samples = {}
    for key in WINDOWS:
        window = limits.get(key) or {}
        used = window.get("used_percentage")
        reset = window.get("resets_at")
        if type(used) in (int, float) and 0 <= used <= 100 and type(reset) is int and reset > time.time():
            samples[key] = {"used": used, "reset": reset}

    if not samples:
        print("Aithya: waiting for Claude quota")
        return
    summary = " · ".join(f"{WINDOWS[key]} {value['used']:g}%" for key, value in samples.items())
    request = urllib.request.Request(
        ENDPOINT,
        data=json.dumps({"p_token": token, "p_windows": samples}).encode(),
        headers={"apikey": PUBLISHABLE_KEY, "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=2) as response:
            synced = json.load(response) is True
    except (OSError, ValueError):
        synced = False
    print("Aithya: " + summary + ("" if synced else " · sync unavailable"))


if __name__ == "__main__":
    try:
        main()
    except (AttributeError, ValueError):
        print("Aithya: waiting for Claude quota")
