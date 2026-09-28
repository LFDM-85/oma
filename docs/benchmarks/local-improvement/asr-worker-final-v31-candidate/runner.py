#!/usr/bin/env python3
"""Measure actual local-speech JSON/24 kHz PCM path using frozen fixtures."""
import argparse,base64,hashlib,json,os,select,subprocess,tempfile,time,wave
from pathlib import Path
from corpus import corpus_hash
from metrics import recognition
p=argparse.ArgumentParser();p.add_argument('--stt',choices=['whisper-small','qwen3-asr-1.7b'],required=True);p.add_argument('--output',type=Path,required=True);p.add_argument('--fixtures',type=Path,required=True);p.add_argument('--split',choices=['dev','final'],default='dev')
p.add_argument('--worker',type=Path,default=Path(__file__).resolve().parents[3]/'runtime/local-speech.py')
a=p.parse_args();a.output.mkdir(parents=True,exist_ok=False)
local=Path.home()/'.local/share/oma/local';worker=a.worker.resolve()
(a.output/'worker.py').write_bytes(worker.read_bytes())
(a.output/'runner.py').write_bytes(Path(__file__).read_bytes())
manifest=json.loads((a.fixtures/'manifest.json').read_text());assert manifest['corpus_sha256']==corpus_hash()
config={'model':a.stt,'worker_sha256':hashlib.sha256(worker.read_bytes()).hexdigest(),'corpus_sha256':corpus_hash(),'split':a.split,'path':'JSON IPC, 24k PCM, scipy resample_poly','warmups':[]}
rows=[]
with tempfile.TemporaryDirectory(prefix='oma-worker-asr-') as root, (a.output/'stderr.log').open('w') as stderr:
 home=Path(root);(home/'whisper').symlink_to(local/'whisper');(home/'speech.json').write_text(json.dumps({'stt':a.stt}))
 child=subprocess.Popen([str(local/'venv/bin/python'),'-u',str(worker),str(home)],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=stderr,text=True,env={**os.environ,'HF_HOME':str(local/'huggingface'),'HF_HUB_OFFLINE':'1','TRANSFORMERS_OFFLINE':'1'})
 seq=0
 def transcribe(c):
  global seq
  path=a.fixtures/c['file'];assert hashlib.sha256(path.read_bytes()).hexdigest()==c['sha256']
  with wave.open(str(path)) as wav:
   assert (wav.getframerate(),wav.getnchannels(),wav.getsampwidth())==(24000,1,2)
   pcm=wav.readframes(wav.getnframes())
  seq+=1;start=time.monotonic();child.stdin.write(json.dumps({'id':seq,'action':'transcribe','language':c['language'],'pcm':base64.b64encode(pcm).decode()})+'\n');child.stdin.flush()
  if not select.select([child.stdout],[],[],120)[0]:
   child.kill();raise TimeoutError('Local speech worker timed out')
  response=json.loads(child.stdout.readline());assert response['id']==seq
  return response,time.monotonic()-start
 try:
  for language in ['ja','en']:
   warm=next(c for c in manifest['cases'] if c['language']==language and c['split']=='dev')
   response,seconds=transcribe(warm);config['warmups'].append({'language':language,'seconds':seconds,'error':response.get('error')})
   inputs=[c for c in manifest['cases'] if c['language']==language and c['split']==a.split]
   for c in inputs:
    row={k:c[k] for k in ['id','language','source','condition']};row['expected']=c['text']
    try:
     response,seconds=transcribe(c);row['seconds']=seconds
     if response.get('error'):row['error']=response['error']
     else:row['actual']=response['text']
    except Exception as error:row['error']=str(error)
    rows.append(row)
    with (a.output/'results.jsonl').open('a') as f:f.write(json.dumps(row,ensure_ascii=False)+'\n')
    print(json.dumps(row,ensure_ascii=False),flush=True)
  status=Path('/proc/'+str(child.pid)+'/status').read_text()
  config['peak_worker_rss_kib']=int(next(l.split()[1] for l in status.splitlines() if l.startswith('VmHWM:')))
 finally:
  try:child.stdin.close()
  except BrokenPipeError:pass
  try:child.wait(timeout=5)
  except subprocess.TimeoutExpired:child.kill();child.wait()
(a.output/'config.json').write_text(json.dumps(config,indent=2)+'\n')
(a.output/'summary.json').write_text(json.dumps({l:recognition([c for c in manifest['cases'] if c['language']==l and c['split']==a.split],[r for r in rows if r['language']==l]) for l in ['ja','en']},ensure_ascii=False,indent=2)+'\n')
