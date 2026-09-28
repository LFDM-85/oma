#!/usr/bin/env python3
"""Run a component matrix with the UI prelude using the same selected model.

Other agent.py arguments, such as --split and --repeat, are forwarded unchanged.
A staged UI supporting local/agent.json is required. Previous selection is restored.
"""
import argparse,hashlib,json,os,subprocess,sys
from pathlib import Path
p=argparse.ArgumentParser(description=__doc__)
p.add_argument('--source',type=Path,required=True)
p.add_argument('--harness',type=Path)
p.add_argument('--model',required=True)
p.add_argument('--thinking',default='off',choices=['off','low','medium','high'])
p.add_argument('--temperature',type=float)
p.add_argument('--top-p',type=float)
p.add_argument('--presence-penalty',type=float)
p.add_argument('--output',type=Path,required=True)
a,rest=p.parse_known_args()
a.source=a.source.resolve();a.output=a.output.resolve();harness=(a.harness or a.source).resolve()
assert not a.output.exists(),'Never overwrite a measurement'
state=json.loads(subprocess.check_output(['omarchy-shell','io.github.komagata.oma','status']))
assert not state['panelOpened'],'Close O.M.A. before selecting a model'
local=Path(os.environ.get('OMA_DATA_DIR',str(Path(os.environ.get('XDG_DATA_HOME',str(Path.home()/'.local/share')))/'oma')))/'local'
path=local/'agent.json';original=path.read_bytes() if path.exists() else None
sampling={k:v for k,v in {'temperature':a.temperature,'top_p':a.top_p,'presence_penalty':a.presence_penalty}.items() if v is not None}
selection={'model':a.model,'thinkingLevel':a.thinking,'sampling':sampling}
command=[sys.executable,str(harness/'tests/voice/evaluation/agent.py'),'--agent-module',str(a.source/'runtime/pi.mjs'),'--model',a.model,'--thinking',a.thinking,'--output',str(a.output),*rest]
for flag,value in [('--temperature',a.temperature),('--top-p',a.top_p),('--presence-penalty',a.presence_penalty)]:
 if value is not None:command += [flag,str(value)]
try:
 path.write_text(json.dumps(selection)+'\n')
 result=subprocess.run(command,env={**os.environ,'OMA_EVALUATION_MODEL':a.model})
finally:
 if original is None:path.unlink(missing_ok=True)
 else:path.write_bytes(original)
 if a.output.exists():
  (a.output/'selection-wrapper.py').write_bytes(Path(__file__).read_bytes())
  (a.output/'ui-selection.json').write_text(json.dumps({'selection':selection,'restored':True,'wrapper_sha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'harness':str(harness)},indent=2)+'\n')
sys.exit(result.returncode)
