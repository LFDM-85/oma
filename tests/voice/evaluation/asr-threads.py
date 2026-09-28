#!/usr/bin/env python3
"""Development-only ASR thread sweep, alternating order on unchanged audio."""
import argparse,hashlib,importlib.util,json,os,time,wave
from pathlib import Path
from environment import environment
ROOT=Path(__file__).resolve().parents[3]
LOCAL=Path.home()/'.local/share/oma/local'
os.environ.update(HF_HOME=str(LOCAL/'huggingface'),HF_HUB_OFFLINE='1',TRANSFORMERS_OFFLINE='1')
p=argparse.ArgumentParser(description=__doc__)
p.add_argument('--fixtures',type=Path,required=True);p.add_argument('--output',type=Path,required=True)
p.add_argument('--int8',action='store_true',help='Development-only PyTorch dynamic Linear quantization')
a=p.parse_args();a.output.mkdir(parents=True,exist_ok=False)
worker=ROOT/'runtime/local-speech.py'
spec=importlib.util.spec_from_file_location('local_worker',worker);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
engine=module.Engines(LOCAL);engine.stt='qwen3-asr-1.7b'
inputs=[]
for language in ['ja','en']:
 manifest=json.loads((a.fixtures/language/'manifest.json').read_text());assert manifest['split']=='dev'
 for name in ['question','write']:
  item=manifest['phrases'][name];path=a.fixtures/language/item['file'];assert hashlib.sha256(path.read_bytes()).hexdigest()==item['sha256']
  with wave.open(str(path)) as wav:
   assert (wav.getframerate(),wav.getnchannels(),wav.getsampwidth())==(24000,1,2)
   pcm=wav.readframes(wav.getnframes())
  inputs.append({'language':language,'id':name,'expected':item['text'],'sha256':item['sha256'],'pcm':pcm})
config={'split':'dev','source':'synthetic','model':'Qwen/Qwen3-ASR-1.7B-hf','worker_sha256':hashlib.sha256(worker.read_bytes()).hexdigest(),'thread_order':[[4,8,16],[16,8,4]],'inputs':[{k:v for k,v in i.items() if k!='pcm'} for i in inputs],'environment':environment('qwen3.5:9b')}
config['precision']='dynamic-int8-linear' if a.int8 else 'float32'
(a.output/'probe.py').write_bytes(Path(__file__).read_bytes())
(a.output/'configuration.json').write_text(json.dumps(config,ensure_ascii=False,indent=2)+'\n')
import torch
original=torch.set_num_threads
for item in inputs:engine.transcribe(item['pcm'],item['language'])
if a.int8:
 start=time.monotonic()
 engine.asr_model=torch.ao.quantization.quantize_dynamic(engine.asr_model,{torch.nn.Linear},dtype=torch.qint8,inplace=True)
 config['quantization_seconds']=time.monotonic()-start
 config['quantized_modules']=sum(isinstance(m,torch.ao.nn.quantized.dynamic.Linear) for m in engine.asr_model.modules())
 (a.output/'configuration.json').write_text(json.dumps(config,ensure_ascii=False,indent=2)+'\n')
with (a.output/'results.jsonl').open('w') as log:
 for repeat,order in enumerate(config['thread_order']):
  for threads in order:
   original(threads);torch.set_num_threads=lambda n:None
   try:
    for item in inputs:
     row={k:v for k,v in item.items() if k!='pcm'};row.update(repeat=repeat,threads=threads);start=time.monotonic()
     try:row['actual']=engine.transcribe(item['pcm'],item['language'])
     except Exception as e:row['error']=str(e)
     row['seconds']=time.monotonic()-start
     log.write(json.dumps(row,ensure_ascii=False)+'\n');log.flush();print(json.dumps(row,ensure_ascii=False),flush=True)
   finally:torch.set_num_threads=original
(a.output/'process-status.txt').write_text(Path('/proc/self/status').read_text())
