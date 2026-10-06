#!/usr/bin/env python3
"""Read-only preflight that works before the Node runtime is available."""
import json
import os
import shutil
import subprocess
from pathlib import Path

missing = []
backend = os.environ.get("OMA_BACKEND", "")
if not backend:
    try:
        backend = json.loads((Path.home()/".config/oma/backend.json").read_text()).get("backend", "")
    except (OSError, ValueError):
        pass
if backend == "dobby":
    local_python = Path.home()/".local/share/omarchy-dobby/runtime/bin/python"
    python = os.environ.get('OMA_DOBBY_PYTHON') or (str(local_python) if local_python.is_file() else shutil.which('python3'))
    for executable in ["node", "voxtype", "pw-record", "pw-play"]:
        if not shutil.which(executable):
            missing.append(executable)
    if not python:
        missing.append("Dobby Python runtime")
    if not shutil.which('dobby') and not os.environ.get('OMA_DOBBY_ROOT'):
        missing.append('Dobby (or OMA_DOBBY_ROOT)')
    if python and not missing:
        try:
            config = json.loads(subprocess.check_output([python, str(Path(__file__).resolve().parent.parent/'runtime/dobby-voice.py'), 'config'], timeout=15, stderr=subprocess.DEVNULL))
            if config.get('error') or not config.get('speechReady'):
                missing.append('Dobby modules and Piper voice')
        except (OSError, ValueError, subprocess.SubprocessError):
            missing.append('Dobby modules and Piper voice')
    print(json.dumps({"setupRequired": bool(missing), "setupMessage": "Missing: " + ", ".join(missing) if missing else "Dobby local runtime is available."}))
    raise SystemExit(0)
try:
    import numpy
except ImportError:
    missing.append("Python NumPy (voice effects)")
try:
    major = int(subprocess.check_output(["node", "-p", "process.versions.node.split('.')[0]"],
                                      timeout=5, stderr=subprocess.DEVNULL).strip())
    if major < 24:
        missing.append("Node.js 24+")
except (OSError, ValueError, subprocess.SubprocessError):
    missing.append("Node.js 24+")
for command, label in [
    ("npm", "npm"),
    ("secret-tool", "Desktop keyring (libsecret)"),
    ("xdg-terminal-exec", "Terminal launcher (run scripts/setup in a terminal)"),
    ("systemd-run", "systemd setup launcher"),
    ("pw-record", "PipeWire recording"),
    ("pw-play", "PipeWire playback"), ("pw-cli", "PipeWire tools"),
    ("wpctl", "WirePlumber"), ("grim", "Screenshots"),
    ("wtype", "Keyboard control"), ("hyprctl", "Hyprland"),
    ("xdg-open", "Desktop launcher"), ("setpriv", "util-linux"),
]:
    if not shutil.which(command):
        missing.append(label)
try:
    subprocess.run(["node", "--input-type=module", "-e",
                    "await import('openai/resources/live/ws')"],
                   cwd=Path(__file__).resolve().parent.parent, timeout=15,
                   check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
except (OSError, subprocess.SubprocessError):
    missing.append("GPT-Live SDK (run SET UP)")
print(json.dumps({"setupRequired": bool(missing),
                  "setupMessage": "Missing: " + ", ".join(missing) if missing else
                  "Runtime dependencies are available. Setup also configures optional features and secure key storage."}))
