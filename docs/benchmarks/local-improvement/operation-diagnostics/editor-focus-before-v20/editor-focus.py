#!/usr/bin/env python3
"""Direct editor diagnostic. No model decisions; never counts as agent acceptance."""
import argparse
import importlib.util
import json
from pathlib import Path
import subprocess
import time

ROOT=Path(__file__).resolve().parents[3]
spec=importlib.util.spec_from_file_location('agent_evaluation',Path(__file__).with_name('agent.py'))
a=importlib.util.module_from_spec(spec);spec.loader.exec_module(a)
v=a.v
p=argparse.ArgumentParser(description=__doc__)
p.add_argument('--source',type=Path,default=ROOT)
p.add_argument('--output',type=Path,required=True)
p.add_argument('--repeat',type=int,default=10)
p.add_argument('--delay-ms',type=int,default=0)
args=p.parse_args();args.output=args.output.resolve();args.output.mkdir(parents=True,exist_ok=False)
original=json.loads(v.ipc('status'));assert not original['panelOpened']
rows=[];h=None
try:
 v.configure('local','ja')
 h=v.VoiceDesktop(Path('/tmp/oma-voice-fixtures/ja'),args.output,98,'local','ja');h.case='empty';h.start()
 for index in range(args.repeat):
  home=args.output/str(index);home.mkdir();h.case_home=home
  a.setup(h,{},home)
  job={'workspace':98,'module':str(args.source.resolve()/'skills/oma/scripts/new-document.mjs'),'text':'Activation probe.','delayMs':args.delay_ms}
  (home/'job.json').write_text(json.dumps(job))
  start=time.monotonic()
  with (home/'stdout.jsonl').open('w') as stdout,(home/'stderr.log').open('w') as stderr:
   result=subprocess.run(a.sandbox_command(home,args.source)+['node',str(Path(__file__).with_suffix('.mjs')),str(home/'job.json')],stdout=stdout,stderr=stderr,timeout=60)
  state=h.document();actual=h.content() if state.get('opened') and state.get('length') else ''
  row={'repeat':index,'returncode':result.returncode,'seconds':time.monotonic()-start,'document':state,'actual':actual,'passed':result.returncode==0 and actual==job['text']}
  rows.append(row);print(json.dumps(row),flush=True)
  (args.output/'results.json').write_text(json.dumps(rows,indent=2)+'\n')
finally:
 if h:h.finish()
 v.ipc('stop');v.wait_setting('panelOpened',False)
 v.configure(original['voiceProvider'],original['responseLanguage'])
 v.restore_microphone(original['microphoneTarget']);v.ipc('viewMode',original['viewMode'])
