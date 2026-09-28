#!/usr/bin/env python3
"""Prepare separate synthetic development voice prompts with local Kokoro."""
import argparse,hashlib,importlib.util,json,os,wave
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3]
LOCAL=Path.home()/'.local/share/oma/local'
os.environ['HF_HOME']=str(LOCAL/'huggingface');os.environ['HF_HUB_OFFLINE']='1';os.environ['TRANSFORMERS_OFFLINE']='1'
p=argparse.ArgumentParser(description=__doc__);p.add_argument('--output',type=Path,required=True);a=p.parse_args()
a.output.mkdir(parents=True,exist_ok=False)
worker=ROOT/'runtime/local-speech.py'
spec=importlib.util.spec_from_file_location('local_worker',worker);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
engine=module.Engines(LOCAL)
corpus=Path(__file__).with_name('e2e-dev-phrases.json');definitions=json.loads(corpus.read_text())
for language,definition in definitions.items():
 directory=a.output/language;directory.mkdir()
 manifest={'split':'dev','language':language,'source':'synthetic','settings':{'model':'Kokoro-82M','voice':module.voice_for(language)[1],'speed':1},'corpus_sha256':hashlib.sha256(corpus.read_bytes()).hexdigest(),'worker_sha256':hashlib.sha256(worker.read_bytes()).hexdigest(),'expectedDocument':definition['expectedDocument'],'phrases':{}}
 for name,text in definition['phrases'].items():
  pcm=b''.join(engine.speak(text,language));path=directory/(name+'.wav')
  with wave.open(str(path),'wb') as wav:
   wav.setnchannels(1);wav.setsampwidth(2);wav.setframerate(24000);wav.writeframes(b'\0'*9600+pcm+b'\0'*14400)
  manifest['phrases'][name]={'text':text,'file':path.name,'sha256':hashlib.sha256(path.read_bytes()).hexdigest()}
  print(language+'/'+name,flush=True)
 (directory/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
