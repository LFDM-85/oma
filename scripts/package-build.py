#!/usr/bin/env python3
"""Stage the explicit runtime payload and publish a content-addressed plugin build.

Does not reload the shell, touch user data, or collect old builds.
"""
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

source, target = (Path(p).resolve() for p in sys.argv[1:])
files = sorted((source / 'scripts/runtime-files.txt').read_text().splitlines())
digest = hashlib.sha256()
for name in files:
    digest.update(name.encode())
    digest.update((source / name).read_bytes())
relative = 'builds/' + digest.hexdigest()[:16]
build = target / relative
target.mkdir(parents=True, exist_ok=True)
# A new URL avoids stale Qt component caches. Stage outside the watched plugin.
if not build.exists():
    staging = Path(tempfile.mkdtemp(prefix='oma-build-', dir=target.parent.parent))
    try:
        for name in files:
            destination = staging / name
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source / name, destination)
        subprocess.run(['npm', 'ci', '--omit=dev', '--ignore-scripts', '--bin-links=false'], cwd=staging, check=True)
        build.parent.mkdir(parents=True, exist_ok=True)
        staging.rename(build)
    finally:
        shutil.rmtree(staging, ignore_errors=True)
for name in ['README.md', 'LICENSE', 'package.json', 'package-lock.json']:
    if not (target / name).exists() or (target / name).read_bytes() != (source / name).read_bytes():
        shutil.copy2(source / name, target / name)
manifest = json.loads((source / 'manifest.json').read_text())
manifest['entryPoints'] = {key: relative + '/' + value for key, value in manifest['entryPoints'].items()}
pending = target / 'manifest.json.pending'
pending.write_text(json.dumps(manifest, indent=2) + '\n')
pending.replace(target / 'manifest.json')
