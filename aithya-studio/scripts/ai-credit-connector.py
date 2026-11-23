"""Aithya connector. Use the personalized download from the AI credits page."""
import json
import os
from pathlib import Path
import queue
import shlex
import shutil
import subprocess
import sys
import threading
import time
import urllib.request

PAIRING = None  # Replaced when the user downloads their personalized connector.
ROOT = Path.home() / ".aithya" / "credits"
ENDPOINT = "https://ekqfotmlnqqrbcizjtfz.supabase.co/rest/v1/rpc/sync_studio_claude_credits"
PUBLIC_KEY = "sb_publishable_6L2ejLr3GRiTmy6RZ3juGw__600cspY"


def send(token, samples):
    if not samples:
        return False
    request = urllib.request.Request(
        ENDPOINT,
        data=json.dumps({"p_token": token, "p_windows": samples}).encode(),
        headers={"apikey": PUBLIC_KEY, "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(request, timeout=3) as response:
            return json.load(response) is True
    except (OSError, ValueError):
        return False


def samples_from(windows, used_key, reset_key):
    samples = {}
    for key, reading in windows.items():
        if not isinstance(reading, dict):
            continue
        used, reset = reading.get(used_key), reading.get(reset_key)
        if type(used) in (int, float) and 0 <= used <= 100 and type(reset) is int and reset > time.time():
            samples[key] = {"used": used, "reset": reset}
    return samples


def write_private(path, data):
    temp = path.with_suffix(".new")
    with os.fdopen(os.open(temp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600), "w") as file:
        file.write(data)
    temp.replace(path)


def install_claude():
    path = Path.home() / ".claude" / "settings.json"
    path.parent.mkdir(exist_ok=True)
    settings = json.loads(path.read_text()) if path.exists() else {}
    current = settings.get("statusLine", {})
    command = current.get("command", "")
    runner = ROOT / "claude-status.py"
    previous = ROOT / "claude-previous.json"
    if command and str(runner) not in command and "AITHYA_CLAUDE_SYNC_TOKEN=" not in command:
        write_private(previous, json.dumps(current))
    if path.exists():
        backup = path.with_name("settings.json.aithya-backup")
        if not backup.exists():
            write_private(backup, path.read_text())
    source = Path(__file__).read_text()
    first = next(line for line in source.splitlines() if line.startswith("PAIRING = "))
    write_private(runner, source.replace(first, "PAIRING = None", 1))
    settings["statusLine"] = {
        "type": "command",
        "command": shlex.join([sys.executable, str(runner), "--claude-status"]),
        "refreshInterval": min(60, current.get("refreshInterval") or 60),
    }
    write_private(path, json.dumps(settings, indent=2) + "\n")
    print("Connected. Open or restart Claude Code and send a message to load your usage.")


def claude_status():
    raw = sys.stdin.read()
    data = json.loads(raw)
    limits = data.get("rate_limits") or {}
    samples = samples_from({key: limits.get(key) for key in ("five_hour", "seven_day")}, "used_percentage", "resets_at")
    for pairing in ROOT.glob("claude-*.json"):
        if pairing.name != "claude-previous.json":
            send(json.loads(pairing.read_text())["token"], samples)
    previous = ROOT / "claude-previous.json"
    if previous.exists():
        command = json.loads(previous.read_text()).get("command")
        if command:
            subprocess.run(command, input=raw, text=True, shell=True, timeout=5, check=False)
            return
    print(" · ".join(f"Claude {key.replace('_', ' ')}: {sample['used']:g}%" for key, sample in samples.items())
          or "Claude usage appears after your first response")


def codex_limits():
    executable = shutil.which("codex")
    if not executable:
        raise RuntimeError("Install Codex CLI and sign in with ChatGPT first.")
    process = subprocess.Popen([executable, "app-server"], stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                               stderr=subprocess.DEVNULL, text=True, encoding="utf-8")
    incoming = queue.Queue()

    def read_lines():
        for line in process.stdout:
            try:
                incoming.put(json.loads(line))
            except ValueError:
                continue
        incoming.put(None)

    threading.Thread(target=read_lines, daemon=True).start()

    def send_message(method, **args):
        process.stdin.write(json.dumps(dict(method=method, **args)) + "\n")
        process.stdin.flush()

    def receive(reply_id):
        deadline = time.monotonic() + 10
        while time.monotonic() < deadline:
            reply = incoming.get(timeout=max(0, deadline - time.monotonic()))
            if reply is None:
                break
            if reply.get("id") == reply_id:
                if "error" in reply:
                    raise RuntimeError("Codex could not read usage. Confirm you signed in with ChatGPT.")
                return reply["result"]
        raise RuntimeError("Codex did not return usage.")

    try:
        send_message("initialize", id=0, params={"clientInfo": {"name": "aithya_credits", "version": "1.0.0"}})
        receive(0)
        send_message("initialized")
        send_message("account/rateLimits/read", id=1)
        result = receive(1)
        limit = (result.get("rateLimitsByLimitId") or {}).get("codex") or result.get("rateLimits") or {}
        return samples_from({key: limit.get(key) for key in ("primary", "secondary")}, "usedPercent", "resetsAt")
    finally:
        process.terminate()
        try:
            process.wait(timeout=2)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait()


def main():
    if "--claude-status" in sys.argv:
        claude_status()
        return
    if PAIRING is None:
        raise RuntimeError("Download a personalized connector from Aithya’s AI credits page.")
    ROOT.mkdir(mode=0o700, parents=True, exist_ok=True)
    provider = PAIRING["provider"]
    write_private(ROOT / f"{provider}-{PAIRING['project']}.json", json.dumps(PAIRING))
    if provider == "claude":
        install_claude()
        return
    print("Keep this terminal open to sync Codex usage. Ctrl+C stops syncing.", flush=True)
    while True:
        try:
            samples = codex_limits()
            results = [send(json.loads(path.read_text())["token"], samples) for path in ROOT.glob("codex-*.json")]
            print("Codex usage synced." if any(results) else "Waiting for Codex usage or a valid Aithya connection.", flush=True)
        except (RuntimeError, OSError, queue.Empty) as exc:
            print(str(exc) or "Codex did not return usage. Retrying.", flush=True)
        time.sleep(60)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        pass
    except (OSError, ValueError, RuntimeError) as error:
        print(f"Aithya setup: {error}", file=sys.stderr)
        sys.exit(1)
