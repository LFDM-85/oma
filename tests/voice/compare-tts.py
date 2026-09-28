#!/usr/bin/env python3
"""Generate dry Japanese listening samples; timing is not a naturalness score."""
import argparse
import importlib.util
import json
import os
import time
from pathlib import Path
import numpy as np
import soundfile as sf

parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--engine',choices=['kokoro','qwen'],required=True)
parser.add_argument('--model',default='Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice')
parser.add_argument('--device',default='cpu')
parser.add_argument('--output',type=Path,required=True)
args=parser.parse_args();args.output.mkdir(parents=True,exist_ok=True)
os.environ.setdefault('HF_HOME',str(Path.home()/'.local/share/oma/local/huggingface'))
if args.engine=='kokoro':
    os.environ['HF_HUB_OFFLINE']='1'
    os.environ['TRANSFORMERS_OFFLINE']='1'
texts=[('greeting','ご指示をお待ちしています。'),
       ('document','こんにちは。今日の天気は雨です。保存せずにファイルを閉じました。'),
       ('numbers','九月二十六日、午後三時半です。過去の会話を開きます。合計は千二百三十四円です。')]
start=time.monotonic()
if args.engine=='kokoro':
    spec=importlib.util.spec_from_file_location('local_speech',Path(__file__).resolve().parents[2]/'runtime/local-speech.py')
    speech=importlib.util.module_from_spec(spec);spec.loader.exec_module(speech)
    engine=speech.Engines(Path.home()/'.local/share/oma/local')
else:
    import torch
    from qwen_tts import Qwen3TTSModel
    torch.set_num_threads(4)
    engine=Qwen3TTSModel.from_pretrained(args.model,device_map=args.device,
        dtype=torch.float32 if args.device=='cpu' else torch.bfloat16,attn_implementation='sdpa')
print(json.dumps(dict(engine=args.engine,model=args.model if args.engine=='qwen' else 'Kokoro-82M',load_seconds=time.monotonic()-start)),flush=True)
for name,text in texts:
    start=time.monotonic();first=None
    if args.engine=='kokoro':
        chunks=[]
        for pcm in engine.speak(text,'ja'):
            if first is None:first=time.monotonic()-start
            chunks.append(np.frombuffer(pcm,dtype='<i2').astype(np.float32)/32768)
        audio=np.concatenate(chunks);rate=24000
    else:
        wavs,rate=engine.generate_custom_voice(text=text,language='Japanese',speaker='Ono_Anna',do_sample=False,max_new_tokens=1024)
        audio=wavs[0];first=time.monotonic()-start
    elapsed=time.monotonic()-start;path=args.output/(name+'.wav');sf.write(path,audio,rate)
    print(json.dumps(dict(engine=args.engine,case=name,text=text,file=str(path),seconds=elapsed,
        first_audio_seconds=first,duration=len(audio)/rate,rtf=elapsed/(len(audio)/rate)),ensure_ascii=False),flush=True)
