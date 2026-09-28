"""Experimental actual JSON worker using a verified tensor-only int8 cache."""
import hashlib,importlib.util,json,os,sys
from pathlib import Path
BASE=Path('/tmp/oma-evaluation-candidate-v31-source/runtime/local-speech.py')
CACHE=Path('/tmp/oma-asr-decoder-int8-cache-v36')
spec=importlib.util.spec_from_file_location('oma_speech_base',BASE)
base=importlib.util.module_from_spec(spec);spec.loader.exec_module(base)
Original=base.Engines
class CachedEngines(Original):
 def prepare_recognition(self,language):
  if self.asr_backend(language)!='qwen3-asr-1.7b':return super().prepare_recognition(language)
  if self.asr_model is not None:return
  import torch
  from transformers import AutoConfig,AutoProcessor,AutoModelForMultimodalLM,initialization
  metadata=json.loads((CACHE/'metadata.json').read_text())
  assert metadata['torch']==torch.__version__
  assert metadata['quantization_scope']=='decoder'
  with (CACHE/'state.pt').open('rb') as f:assert hashlib.file_digest(f,'sha256').hexdigest()==metadata['state_sha256']
  torch.backends.quantized.engine='onednn';torch.set_num_threads(base.speech_thread_count())
  config=AutoConfig.from_pretrained(metadata['model'],local_files_only=True)
  with initialization.no_init_weights():model=AutoModelForMultimodalLM.from_config(config,dtype=torch.float32)
  for name,definition in metadata['modules'].items():
   parent_name,_,leaf=name.rpartition('.');parent=model.get_submodule(parent_name)
   replacement=torch.ao.nn.quantized.dynamic.Linear(1,1,definition['bias'],dtype=torch.qint8)
   replacement.in_features=definition['in_features'];replacement.out_features=definition['out_features']
   setattr(parent,leaf,replacement)
  state=torch.load(CACHE/'state.pt',map_location='cpu',weights_only=True)
  model.load_state_dict(state,strict=True,assign=True);del state
  self.asr_model=model.eval();self.asr_processor=AutoProcessor.from_pretrained(metadata['model'],local_files_only=True)
base.Engines=CachedEngines
base.main(sys.argv[1])
