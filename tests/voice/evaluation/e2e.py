#!/usr/bin/env python3
"""Run the real local voice pipeline with recorded, temporarily selected models."""
import argparse,hashlib,json,os,subprocess,sys,tarfile
from pathlib import Path

from environment import environment

ROOT=Path(__file__).resolve().parents[3]
p=argparse.ArgumentParser(description=__doc__)
p.add_argument('--model',required=True,choices=['qwen3.5:4b','qwen3.5:4b-q8_0','qwen3.5:9b','qwen3.6:35b','gemma4:e2b'])
p.add_argument('--stt',required=True,choices=['whisper-small','qwen3-asr-1.7b'])
p.add_argument('--thinking',choices=['off','low','medium','high'],default='off')
p.add_argument('--temperature',type=float)
p.add_argument('--top-p',type=float)
p.add_argument('--presence-penalty',type=float)
p.add_argument('--speech-cpus',nargs='+',type=int,help='Optional ASR-only CPU affinity; other speech work retains its original affinity')
p.add_argument('--output',type=Path,required=True)
p.add_argument('--split',choices=['dev','final'],default='final')
p.add_argument('--fixtures',type=Path,default=Path('/tmp/oma-voice-fixtures'))
p.add_argument('--repeat',type=int,default=3)
p.add_argument('--languages',nargs='+',choices=['ja','en'],default=['ja','en'])
p.add_argument('--cases',nargs='+')
a=p.parse_args()
fixtures={}
for language in a.languages:
 directory=a.fixtures.resolve()/language
 manifest=json.loads((directory/'manifest.json').read_text())
 assert manifest.get('split','final')==a.split,'Fixture split does not match requested evaluation split'
 fixtures[language]={'manifest':manifest,'manifest_sha256':hashlib.sha256((directory/'manifest.json').read_bytes()).hexdigest(),'audio_sha256':{row['file']:hashlib.sha256((directory/row['file']).read_bytes()).hexdigest() for row in manifest['phrases'].values()}}
a.output=a.output.resolve();a.output.mkdir(parents=True,exist_ok=False)
observed_environment=environment(a.model)
(a.output/'environment.json').write_text(json.dumps(observed_environment,indent=2)+'\n')
plugin=Path.home()/'.config/omarchy/plugins/io.github.komagata.oma'
installed=plugin/Path(observed_environment['installed_entrypoints']['service']).parent
sources=[*installed.glob('*.qml'),*installed.glob('evaluation-*.py'),*installed.glob('evaluation-*.json'),*(installed/'runtime').glob('*.mjs'),*(installed/'runtime').glob('*.py'),*(installed/'skills').rglob('*.md'),*(installed/'skills').rglob('*.mjs'),installed/'package-lock.json']
(a.output/'installed-source-hashes.json').write_text(json.dumps({str(path.relative_to(installed)):hashlib.sha256(path.read_bytes()).hexdigest() for path in sources},indent=2)+'\n')
harness=[path for path in (ROOT/'tests/voice').rglob('*') if path.is_file() and path.suffix in ('.py','.mjs','.json')]
(a.output/'harness-hashes.json').write_text(json.dumps({str(path.relative_to(ROOT)):hashlib.sha256(path.read_bytes()).hexdigest() for path in harness},indent=2)+'\n')
for name,base,files in [('installed-source',installed,sources),('harness',ROOT,harness)]:
 with tarfile.open(a.output/(name+'.tar.gz'),'w:gz') as archive:
  for path in files:archive.add(path,arcname=str(path.relative_to(base)))
state=json.loads(subprocess.check_output(['omarchy-shell','io.github.komagata.oma','status']))
assert not state['panelOpened'],'Close O.M.A. before selecting evaluation models'
local=Path(os.environ.get('OMA_DATA_DIR',str(Path(os.environ.get('XDG_DATA_HOME',str(Path.home()/'.local/share')))/'oma')))/'local'
updates={'agent.json':{'model':a.model,'thinkingLevel':a.thinking},'speech.json':{'stt':a.stt}}
if a.speech_cpus is not None:updates['speech.json']['asr_cpu_affinity']=a.speech_cpus
sampling={k:v for k,v in {'temperature':a.temperature,'top_p':a.top_p,'presence_penalty':a.presence_penalty}.items() if v is not None}
if sampling:updates['agent.json']['sampling']=sampling
backups={name:(local/name).read_bytes() if (local/name).exists() else None for name in updates}
(a.output/'configuration.json').write_text(json.dumps({'split':a.split,'fixtures':str(a.fixtures.resolve()),'fixture_provenance':fixtures,'model':a.model,'stt':a.stt,'asr_cpu_affinity':a.speech_cpus,'thinking':a.thinking,'sampling_overrides':sampling,'repeat':a.repeat,'languages':a.languages,'cases':a.cases,'local_directory':str(local)},indent=2)+'\n')
for name,data in backups.items():
 if data is not None:(a.output/('original-'+name)).write_bytes(data)
command=[sys.executable,str(ROOT/'tests/voice/run.py'),'--fixtures',str(a.fixtures.resolve()),'--providers','local','--languages',*a.languages,'--repeat',str(a.repeat),'--keep-going','--artifacts',str(a.output/'trials')]
if a.cases:command+=['--cases',*a.cases]
try:
 for name,value in updates.items():(local/name).write_text(json.dumps(value)+'\n')
 with (a.output/'runner.log').open('w') as log:
  result=subprocess.run(command,stdout=log,stderr=subprocess.STDOUT,env={**os.environ,'OMA_EVALUATION_MODEL':a.model})
finally:
 for name,data in backups.items():
  if data is None:(local/name).unlink(missing_ok=True)
  else:(local/name).write_bytes(data)
 for directory in (a.output/'trials').glob('*'):
  if directory.is_dir():
   (directory/'evaluation.json').write_text(json.dumps({'split':a.split,'configuration':'../../configuration.json','source':'synthetic'},indent=2)+'\n')
sys.exit(result.returncode)
