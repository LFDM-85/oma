#!/usr/bin/env python3
"""Fixed Japanese reading experiment: independent kana readback, never kanji re-conversion."""
import argparse,hashlib,importlib.metadata,json,os,platform,shutil,subprocess,time
from pathlib import Path
LOCAL=Path.home()/'.local/share/oma/local'
ROOT=Path(__file__).parent
ASR='slplab/wav2vec2-xls-r-300m-japanese-hiragana'

def digest(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def main():
 p=argparse.ArgumentParser(description=__doc__)
 p.add_argument('action',choices=['synthesize','recognize'])
 p.add_argument('--engine',choices=['kokoro','qwen'])
 p.add_argument('--recognizer',choices=['slplab','sakasegawa'],default='slplab')
 p.add_argument('--output',type=Path,required=True)
 p.add_argument('--input',type=Path,nargs='*')
 a=p.parse_args()
 a.output.mkdir(parents=True,exist_ok=False)
 os.environ.update(HF_HOME=str(LOCAL/'huggingface'),HF_HUB_OFFLINE='1',TRANSFORMERS_OFFLINE='1')
 import numpy as np,soundfile as sf,torch
 torch.set_num_threads(8)
 from stt import model_identity
 corpus=json.loads((ROOT/'readings-ja.json').read_text())
 shutil.copy2(ROOT/'readings-ja.json',a.output/'corpus.json')
 for name in ['reading.py','reading_metrics.py']:shutil.copy2(ROOT/name,a.output/name)
 config={'corpus_sha256':digest(ROOT/'readings-ja.json'),'environment':platform.uname()._asdict(),'threads':8,'seed':0,'versions':{n:importlib.metadata.version(n) for n in ['torch','transformers','numpy','soundfile']},'listening':'pending'}
 rows=[]
 def emit(row):
  rows.append(row)
  with (a.output/'results.jsonl').open('a') as f:f.write(json.dumps(row,ensure_ascii=False)+'\n')
  print(json.dumps({k:row[k] for k in ['voice','id','variant','actual','error'] if k in row},ensure_ascii=False),flush=True)
 if a.action=='synthesize':
  if not a.engine:p.error('--engine required')
  config['model']='hexgrad/Kokoro-82M' if a.engine=='kokoro' else 'Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice'
  config['weights']=model_identity('qwen',config['model'])
  config['engine']=a.engine
  config['speed_method']='native speed parameter' if a.engine=='kokoro' else 'raw generation then ffmpeg atempo=1.2; pitch-preserving, differs from browser algorithm'
  config['generation']={'do_sample':True,'max_new_tokens':1024,'dtype':'float32'} if a.engine=='qwen' else {'speed':[1,1.2]}
  config['voices']=['jm_kumo'] if a.engine=='kokoro' else ['Ryan','Uncle_Fu']
  (a.output/'config.json').write_text(json.dumps(config,ensure_ascii=False,indent=2)+'\n')
  if a.engine=='kokoro':
   from kokoro import KModel,KPipeline
   model=KModel(repo_id=config['model']).eval();pipe=KPipeline(lang_code='j',model=model,repo_id=config['model'])
  else:
   from qwen_tts import Qwen3TTSModel
   model=Qwen3TTSModel.from_pretrained(config['weights']['resolved_path'],device_map='cpu',dtype=torch.float32,attn_implementation='sdpa',local_files_only=True)
  for voice in config['voices']:
   for case in corpus['controls']+corpus['cases']:
    start=time.monotonic()
    try:
     for speed in [1,1.2]:
      torch.manual_seed(0);np.random.seed(0)
      output=a.output/f'{voice}-{case["id"]}-{speed}.wav'
      if a.engine=='kokoro':
       audio=np.concatenate([r.audio.numpy() for r in pipe(case['text'],voice=voice,speed=speed)]);rate=24000
       sf.write(output,audio,rate,subtype='PCM_16')
      elif speed==1:
       waves,rate=model.generate_custom_voice(text=case['text'],language='Japanese',speaker=voice,do_sample=True,max_new_tokens=1024)
       audio=np.asarray(waves[0]);sf.write(output,audio,rate,subtype='PCM_16')
      else:
       source=a.output/f'{voice}-{case["id"]}-1.wav'
       subprocess.run(['ffmpeg','-nostdin','-v','error','-i',str(source),'-af','atempo=1.2',str(output)],check=True)
       audio,rate=sf.read(output)
      if not audio.size or not np.isfinite(audio).all() or np.max(np.abs(audio))<.001:raise ValueError('Empty, nonfinite or inaudible output')
      emit(dict(voice=voice,id=case['id'],variant=str(speed),file=output.name,sha256=digest(output),text=case['text'],duration=len(audio)/rate,elapsed=time.monotonic()-start))
    except Exception as e:emit(dict(voice=voice,id=case['id'],error=repr(e)))
 else:
  from transformers import Wav2Vec2Processor,Wav2Vec2ForCTC,Wav2Vec2Model,Wav2Vec2Config,Wav2Vec2FeatureExtractor
  from scipy.signal import resample_poly
  from reading_metrics import decode_ctc
  import math
  config['model']=ASR if a.recognizer=='slplab' else 'sakasegawa/japanese-wav2vec2-large-hiragana-ctc'
  config['weights']=model_identity('qwen',config['model'])
  if a.recognizer=='slplab':
   processor=Wav2Vec2Processor.from_pretrained(config['weights']['resolved_path'],local_files_only=True)
   model=Wav2Vec2ForCTC.from_pretrained(config['weights']['resolved_path'],local_files_only=True).eval()
   def recognize(audio):
    inputs=processor(audio,sampling_rate=16000,return_tensors='pt')
    with torch.inference_mode():logits=model(**inputs).logits
    return processor.batch_decode(torch.argmax(logits,dim=-1))[0]
  else:
   checkpoint=torch.load(Path(config['weights']['resolved_path'])/'best-medium-ep5-inference.pt',map_location='cpu',weights_only=True)
   assert checkpoint['pretrained']=='reazon-research/japanese-wav2vec2-large'
   config['encoder_config']=model_identity('qwen',checkpoint['pretrained'])
   base=config['encoder_config']['resolved_path']
   processor=Wav2Vec2FeatureExtractor.from_pretrained(base,local_files_only=True)
   model=Wav2Vec2Model(Wav2Vec2Config.from_pretrained(base,local_files_only=True)).eval()
   state=checkpoint['model_state_dict']
   model.load_state_dict({k.removeprefix('encoder.'):v for k,v in state.items() if k.startswith('encoder.')},strict=True)
   head=torch.nn.Linear(model.config.hidden_size,state['kana_head.weight'].shape[0]).eval()
   head.load_state_dict({k.removeprefix('kana_head.'):v for k,v in state.items() if k.startswith('kana_head.')},strict=True)
   # Vocabulary order published in upstream src/asr/kana_vocab.py. No remote code executed.
   kana='あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをんがぎぐげござじずぜぞだぢづでどばびぶべぼぱぴぷぺぽぁぃぅぇぉっゃゅょゎー'
   vocabulary={0:'<blank>',**{i+1:k for i,k in enumerate(kana)}}
   assert len(vocabulary)==head.out_features
   config['decoder']='Greedy kana CTC; encoder and kana head strict-loaded; phoneme auxiliary head unused'
   config['kana_vocabulary']=vocabulary
   del checkpoint,state
   def recognize(audio):
    inputs=processor(audio,sampling_rate=16000,return_tensors='pt')
    with torch.inference_mode():logits=head(model(**inputs).last_hidden_state)
    return decode_ctc(logits.argmax(dim=-1)[0].tolist(),vocabulary)
  (a.output/'config.json').write_text(json.dumps(config,ensure_ascii=False,indent=2)+'\n')
  for directory in a.input or []:
   source_config=json.loads((directory/'config.json').read_text())
   assert source_config['corpus_sha256']==config['corpus_sha256']
   for row in map(json.loads,(directory/'results.jsonl').read_text().splitlines()):
    if row.get('error'):emit(dict(row,configuration=directory.name));continue
    try:
     f=directory/row['file'];assert digest(f)==row['sha256']
     samples,rate=sf.read(f);divisor=math.gcd(rate,16000)
     audio=resample_poly(samples,16000//divisor,rate//divisor).astype(np.float32)
     actual=recognize(audio)
     emit(dict(row,configuration=directory.name,actual=actual))
    except Exception as e:emit(dict(row,configuration=directory.name,error=repr(e)))
 if any(r.get('error') for r in rows):raise SystemExit(1)
if __name__=='__main__':main()
