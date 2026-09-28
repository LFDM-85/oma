#!/usr/bin/env python3
"""Install an isolated local evaluation build without overwriting plugin sources.

Only the manifest entrypoints change. Keep the required backup for restoration.
This is a development build using the checkout's node_modules, not a release.
"""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import tempfile
import time

p=argparse.ArgumentParser(description=__doc__)
p.add_argument('--backup',type=Path,required=True)
p.add_argument('--source',type=Path,help='Use a separately frozen or retained original implementation')
p.add_argument('--sandbox-profile',type=Path,help='Prepared private voice evaluation profile; host filesystem becomes read-only')
a=p.parse_args()
root=(a.source or Path(__file__).resolve().parents[3]).resolve()
sandbox_profile=a.sandbox_profile.resolve() if a.sandbox_profile else None
worker_wrapper=Path(__file__).with_name('worker-sandbox.py')
service_override=None
if sandbox_profile:
    import importlib.util
    spec=importlib.util.spec_from_file_location('worker_sandbox',worker_wrapper)
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    module.sandbox_command(sandbox_profile,[root])  # Validate the prepared profile before any mutation.
    original_command=r'command: ["node", Qt.resolvedUrl("runtime/main.mjs").toString().replace(/^file:\/\//, "")]'
    service=(root/'Service.qml').read_text();assert service.count(original_command)==1,'Unrecognized worker command'
    arguments=r'["python3", Qt.resolvedUrl("evaluation-worker.py").toString().replace(/^file:\/\//, ""), "--profile", '+json.dumps(str(sandbox_profile))+', "--source", '+json.dumps(str(root))+r', Qt.resolvedUrl("runtime/main.mjs").toString().replace(/^file:\/\//, "")]'
    service_override=service.replace(original_command,'command: '+arguments)
plugin='io.github.komagata.oma'
destination=Path.home()/'.config/omarchy/plugins'/plugin
run=lambda *args:subprocess.check_output(args,timeout=30).decode()
assert not json.loads(run('omarchy-shell',plugin,'status'))['panelOpened'],'Close O.M.A. before staging'
assert not a.backup.exists(),'Never overwrite a previous manifest backup'
files=[root/n for n in ['package.json','package-lock.json','.npmrc','runtime/oma-pointer']]
for pattern in ['*.qml','runtime/*.mjs','runtime/*.py','scripts/*','native/*','docs/*.md','assets/*','skills/*/SKILL.md','skills/*/scripts/*.mjs']:
    files.extend(p for p in root.glob(pattern) if p.is_file())
digest=hashlib.sha256()
for file in sorted(files):digest.update(str(file.relative_to(root)).encode());digest.update(file.read_bytes())
if sandbox_profile:
    digest.update(service_override.encode());digest.update(worker_wrapper.read_bytes())
relative='builds/evaluation-'+digest.hexdigest()[:16]
build=destination/relative
if not build.exists():
    staging=Path(tempfile.mkdtemp(prefix='oma-evaluation-',dir=destination.parent.parent))
    try:
        for file in files:
            target=staging/file.relative_to(root);target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(file,target)
        if sandbox_profile:
            (staging/'Service.qml').write_text(service_override)
            shutil.copy2(worker_wrapper,staging/'evaluation-worker.py')
            (staging/'evaluation-isolation.json').write_text(json.dumps({'profile':str(sandbox_profile),'source':str(root),'original_service_sha256':hashlib.sha256((root/'Service.qml').read_bytes()).hexdigest(),'worker_wrapper_sha256':hashlib.sha256(worker_wrapper.read_bytes()).hexdigest(),'scope':'read-only worker filesystem; shared host desktop IPC'},indent=2)+'\n')
        (staging/'node_modules').symlink_to(root/'node_modules',target_is_directory=True)
        staging.rename(build)
    finally:
        if staging.exists():shutil.rmtree(staging)
manifest=destination/'manifest.json'
a.backup.write_bytes(manifest.read_bytes())
value=json.loads(manifest.read_text())
value['entryPoints']={key:relative+'/'+Path(path).name for key,path in value['entryPoints'].items()}
pending=destination/'manifest.json.pending';pending.write_text(json.dumps(value,indent=2)+'\n');pending.replace(manifest)
run('omarchy','plugin','disable',plugin)
run('omarchy-shell','shell','rescanPlugins')
run('omarchy','plugin','enable',plugin)
expected=str(build/'runtime/main.mjs').encode()
for _ in range(60):
    found=False
    for process in Path('/proc').glob('[0-9]*/cmdline'):
        try:
            if expected in process.read_bytes().split(b'\0'):found=True;break
        except OSError:pass
    if found and not json.loads(run('omarchy-shell',plugin,'status'))['setupRequired']:
        print(json.dumps({'build':str(build),'manifest_backup':str(a.backup),'running_worker_verified':True}));break
    time.sleep(1)
else:raise RuntimeError('The staged worker did not become ready; manifest backup is available for restoration')
