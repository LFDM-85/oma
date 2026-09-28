#!/usr/bin/env python3
"""Stage read-only document inspection in a copied OmaText evaluation build.

Never changes the editor's typing, file IO, dialogs or model tool contract.
Restore the saved manifest after evaluation. Do not run during another matrix.
"""
import argparse,hashlib,json,subprocess,time
from pathlib import Path

p=argparse.ArgumentParser(description=__doc__)
p.add_argument('--backup',type=Path,required=True)
a=p.parse_args()
plugin='io.github.komagata.omatext'
root=Path.home()/'.config/omarchy/plugins'/plugin
run=lambda *args:subprocess.check_output(args,timeout=30).decode()
assert not json.loads(run('omarchy-shell','io.github.komagata.oma','status'))['panelOpened'],'Close O.M.A. first'
assert not json.loads(run('omarchy-shell','shell','call',plugin,'inspectState',''))['opened'],'Close the editor first'
assert not a.backup.exists(),'Never overwrite a manifest backup'
manifest=root/'manifest.json'
assert json.loads(manifest.read_text())['entryPoints']['panel']=='ui/Editor.qml','Expected the original OmaText entry point'
files={str(f.relative_to(root)):f.read_bytes() for folder in ['ui','scripts'] for f in (root/folder).rglob('*') if f.is_file() and '__pycache__' not in f.parts}
base=files['ui/EditorBase.qml'].decode()
anchor='    function hideEditor()'
assert base.count(anchor)==1
method='    function inspectEvaluationDocument(unused) { return JSON.stringify({opened: opened, text: backendDocument.text, url: backendDocument.url.toString(), modified: backendDocument.modified, busy: backendDocument.busy, modalOpen: window.modalOpen}) }\n'
files['ui/EditorBase.qml']=base.replace(anchor,method+anchor).encode()
digest=hashlib.sha256()
for name,data in sorted(files.items()):digest.update(name.encode());digest.update(data)
relative='builds/evaluation-inspection-'+digest.hexdigest()[:16]
build=root/relative
if not build.exists():
    for name,data in files.items():
        path=build/name;path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes(data)
    (build/'source-hashes.json').write_text(json.dumps({name:hashlib.sha256(data).hexdigest() for name,data in files.items()},indent=2)+'\n')
a.backup.write_bytes(manifest.read_bytes())
value=json.loads(manifest.read_text());value['entryPoints']['panel']=relative+'/ui/Editor.qml'
manifest.write_text(json.dumps(value,indent=2)+'\n')
run('omarchy','plugin','disable',plugin)
run('omarchy-shell','shell','rescanPlugins')
run('omarchy','plugin','enable',plugin)
for attempt in range(20):
    try:
        state=json.loads(run('omarchy-shell','shell','call',plugin,'inspectEvaluationDocument',''))
        assert state['opened'] is False and isinstance(state['text'],str),state
        break
    except (subprocess.CalledProcessError,json.JSONDecodeError,AssertionError):
        if attempt==19:raise
        time.sleep(.25)
print(json.dumps({'build':str(build),'manifest_backup':str(a.backup),'read_only_inspection_verified':True}))
