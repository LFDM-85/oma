#!/usr/bin/env python3
"""Development prototype: cache only tensor state, never unpickle model code."""
import argparse,hashlib,importlib.util,json,os,time,wave
from pathlib import Path
LOCAL=Path.home()/'.local/share/oma/local'
os.environ.update(HF_HOME=str(LOCAL/'huggingface'),HF_HUB_OFFLINE='1',TRANSFORMERS_OFFLINE='1')
p=argparse.ArgumentParser(description=__doc__)
p.add_argument('action',choices=['prepare','probe']);p.add_argument('--cache',type=Path,required=True)
p.add_argument('--fixtures',type=Path,required=True);p.add_argument('--output',type=Path,required=True)
a=p.parse_args();a.output.mkdir(parents=True,exist_ok=False)
worker=Path(__file__).resolve().parents[3]/'runtime/local-speech.py'
spec=importlib.util.spec_from_file_location('local_worker',worker);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
engine=module.Engines(LOCAL);engine.stt='qwen3-asr-1.7b'
def digest(path):
 with path.open('rb') as f:return hashlib.file_digest(f,'sha256').hexdigest()
def audio(language,name):
 manifest=json.loads((a.fixtures/language/'manifest.json').read_text());assert manifest['split']=='dev'
 item=manifest['phrases'][name];path=a.fixtures/language/item['file'];assert digest(path)==item['sha256']
 with wave.open(str(path)) as w:
  assert (w.getframerate(),w.getnchannels(),w.getsampwidth())==(24000,1,2)
  return w.readframes(w.getnframes()),item
import torch
from transformers import AutoConfig,AutoProcessor,AutoModelForMultimodalLM,initialization
model_id='Qwen/Qwen3-ASR-1.7B-hf'
torch.set_num_threads(8)
start=time.monotonic()
if a.action=='prepare':
 a.cache.mkdir(parents=True,exist_ok=False)
 engine.transcribe(audio('en','question')[0],'en')
 model=torch.ao.quantization.quantize_dynamic(engine.asr_model,{torch.nn.Linear},dtype=torch.qint8,inplace=True)
 modules={name:{'in_features':m.in_features,'out_features':m.out_features,'bias':m.bias() is not None} for name,m in model.named_modules() if isinstance(m,torch.ao.nn.quantized.dynamic.Linear)}
 torch.save(model.state_dict(),a.cache/'state.pt')
 metadata={'model':model_id,'torch':torch.__version__,'modules':modules,'state_sha256':digest(a.cache/'state.pt'),'worker_sha256':digest(worker)}
 (a.cache/'metadata.json').write_text(json.dumps(metadata,indent=2)+'\n')
else:
 metadata=json.loads((a.cache/'metadata.json').read_text());assert metadata['torch']==torch.__version__
 assert digest(a.cache/'state.pt')==metadata['state_sha256']
 config=AutoConfig.from_pretrained(model_id,local_files_only=True)
 # Allocate the architecture without random initialization. Non-persistent
 # position buffers are still constructed normally on CPU, unlike meta tensors.
 with initialization.no_init_weights():model=AutoModelForMultimodalLM.from_config(config,dtype=torch.float32)
 for name,definition in metadata['modules'].items():
  parent_name,_,leaf=name.rpartition('.');parent=model.get_submodule(parent_name)
  setattr(parent,leaf,torch.ao.nn.quantized.dynamic.Linear(definition['in_features'],definition['out_features'],definition['bias'],dtype=torch.qint8))
 state=torch.load(a.cache/'state.pt',map_location='cpu',weights_only=True)
 model.load_state_dict(state,strict=True,assign=True);del state
 engine.asr_model=model.eval();engine.asr_processor=AutoProcessor.from_pretrained(model_id,local_files_only=True)
engine.asr_model=model.eval()
setup=time.monotonic()-start
rows=[]
for language in ['ja','en']:
 for name in ['question','write']:
  pcm,item=audio(language,name);row={'language':language,'id':name,'expected':item['text'],'sha256':item['sha256']};start=time.monotonic()
  try:row['actual']=engine.transcribe(pcm,language)
  except Exception as error:row['error']=str(error)
  row['seconds']=time.monotonic()-start;rows.append(row);print(json.dumps(row,ensure_ascii=False),flush=True)
(a.output/'results.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2)+'\n')
(a.output/'configuration.json').write_text(json.dumps({'action':a.action,'setup_seconds':setup,'cache':str(a.cache),'state_sha256':metadata['state_sha256'],'split':'dev','source':'synthetic','worker_sha256':digest(worker)},indent=2)+'\n')
(a.output/'probe.py').write_bytes(Path(__file__).read_bytes())
(a.output/'process-status.txt').write_text(Path('/proc/self/status').read_text())
