#!/usr/bin/env python3
"""Development measurement of cancelled-preview queueing in the actual JSON worker."""
import argparse,base64,hashlib,json,os,queue,subprocess,tempfile,threading,time,wave
from pathlib import Path

p=argparse.ArgumentParser(description=__doc__)
p.add_argument('--worker',type=Path,required=True)
p.add_argument('--fixtures',type=Path,required=True)
p.add_argument('--output',type=Path,required=True)
p.add_argument('--repeat',type=int,default=3)
a=p.parse_args();a.output.mkdir(parents=True,exist_ok=False)
local=Path.home()/'.local/share/oma/local';worker=a.worker.resolve()
(a.output/'worker.py').write_bytes(worker.read_bytes())
(a.output/'runner.py').write_bytes(Path(__file__).read_bytes())
config={'split':'dev','source':'synthetic','stt':'qwen3-asr-1.7b','worker_sha256':hashlib.sha256(worker.read_bytes()).hexdigest(),'preview_seconds':8,'cancel_after_seconds':.8,'repeat':a.repeat,'fixtures':{}}
with tempfile.TemporaryDirectory(prefix='oma-cancel-asr-') as root,(a.output/'stderr.log').open('w') as log:
 home=Path(root);(home/'speech.json').write_text(json.dumps({'stt':'qwen3-asr-1.7b'}))
 child=subprocess.Popen([str(local/'venv/bin/python'),'-u',str(worker),str(home)],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=log,text=True,env={**os.environ,'HF_HOME':str(local/'huggingface'),'HF_HUB_OFFLINE':'1','TRANSFORMERS_OFFLINE':'1'})
 responses=queue.Queue()
 def read():
  try:
   for line in child.stdout:responses.put((time.monotonic(),json.loads(line)))
  finally:responses.put((time.monotonic(),{'worker_closed':True}))
 threading.Thread(target=read,daemon=True).start()
 sequence=0
 def send(action,**payload):
  global sequence
  sequence+=1;child.stdin.write(json.dumps({'id':sequence,'action':action,**payload})+'\n');child.stdin.flush();return sequence
 def receive(target):
  events=[];deadline=time.monotonic()+120
  while True:
   at,response=responses.get(timeout=max(.001,deadline-time.monotonic()))
   if response.get('worker_closed'):raise RuntimeError('Speech worker exited')
   events.append({'at':at,'response':response})
   if response.get('id')==target:return at,response,events
 try:
  start=time.monotonic();_,ready,_=receive(send('prepare_recognition',language='ja'))
  assert ready.get('done') and not ready.get('error'),ready
  config['preparation_seconds']=time.monotonic()-start
  for language in ('ja','en'):
   manifest=json.loads((a.fixtures/language/'manifest.json').read_text());assert manifest['split']=='dev'
   item=manifest['phrases']['write'];path=a.fixtures/language/item['file']
   assert hashlib.sha256(path.read_bytes()).hexdigest()==item['sha256']
   config['fixtures'][language]=item
   with wave.open(str(path)) as wav:
    assert (wav.getframerate(),wav.getnchannels(),wav.getsampwidth())==(24000,1,2)
    pcm=wav.readframes(wav.getnframes())
   for repeat in range(a.repeat):
    row={'language':language,'repeat':repeat,'source':'synthetic'}
    start=time.monotonic()
    preview=send('transcribe',language=language,pcm=base64.b64encode(pcm[:8*24000*2]).decode())
    time.sleep(.8)
    child.stdin.write(json.dumps({'id':preview,'action':'cancel'})+'\n');child.stdin.flush()
    submitted=time.monotonic()
    final=send('transcribe',language=language,pcm=base64.b64encode(pcm).decode())
    try:
     done,response,events=receive(final)
     row.update(final_seconds=done-submitted,total_seconds=done-start,response=response,events=[{'seconds':e['at']-start,'response':e['response']} for e in events])
    except Exception as error:row['error']=str(error)
    with (a.output/'results.jsonl').open('a') as f:f.write(json.dumps(row,ensure_ascii=False)+'\n')
    print(json.dumps(row,ensure_ascii=False),flush=True)
  (a.output/'process-status.txt').write_text(Path(f'/proc/{child.pid}/status').read_text())
 finally:
  child.stdin.close()
  try:child.wait(timeout=5)
  except subprocess.TimeoutExpired:child.kill();child.wait()
  (a.output/'configuration.json').write_text(json.dumps(config,ensure_ascii=False,indent=2)+'\n')
