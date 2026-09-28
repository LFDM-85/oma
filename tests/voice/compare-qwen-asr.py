#!/usr/bin/env python3
"""Opt-in native Transformers Qwen ASR comparison on the same Japanese clips."""
import json
import argparse
import os
import time
from pathlib import Path
import numpy as np
import torch
import soundfile as sf
os.environ.setdefault('HF_HOME',str(Path.home()/'.local/share/oma/local/huggingface'))
from transformers import AutoProcessor,AutoModelForMultimodalLM
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--vad',action='store_true',help='Apply the same Silero VAD defaults as Whisper')
args=parser.parse_args()
label='qwen-asr-0.6b'+('-vad' if args.vad else '')
torch.set_num_threads(4)
model_id='Qwen/Qwen3-ASR-0.6B-hf'
start=time.monotonic()
processor=AutoProcessor.from_pretrained(model_id)
model=AutoModelForMultimodalLM.from_pretrained(model_id,dtype=torch.float32).eval()
print(json.dumps(dict(model=label,load_seconds=time.monotonic()-start)),flush=True)
root=Path('/tmp/oma-voice-fixtures/ja')
phrases=json.loads((root/'manifest.json').read_text())['phrases']
scratch=Path('/tmp/oma-model-research');scratch.mkdir(exist_ok=True)
for name,audio in [('silence',np.zeros(48000,dtype=np.float32)),('quiet-noise',np.random.default_rng(0).normal(0,.001,48000).astype(np.float32))]:
    path=scratch/(name+'.wav');sf.write(path,audio,16000)
    phrases[name]={'file':str(path),'text':''}
for key,item in phrases.items():
    start=time.monotonic()
    audio_path=str(root/item['file'])
    if args.vad:
        from faster_whisper.audio import decode_audio
        from faster_whisper.vad import get_speech_timestamps,collect_chunks
        samples=decode_audio(audio_path,sampling_rate=16000)
        segments=get_speech_timestamps(samples)
        if not segments:
            print(json.dumps(dict(model=label,case=key,expected=item['text'],actual='',seconds=round(time.monotonic()-start,3))),flush=True)
            continue
        chunks,_=collect_chunks(samples,segments)
        path=scratch/('vad-'+key+'.wav');sf.write(path,np.concatenate(chunks),16000)
        audio_path=str(path)
    inputs=processor.apply_transcription_request(audio=audio_path,language='Japanese',
        prompt='Voice commands to the O.M.A. desktop assistant. Applications, documents, conversation history. O.M.A., OmaText.').to(model.device,model.dtype)
    with torch.inference_mode():
        output=model.generate(**inputs,max_new_tokens=256,do_sample=False)
    actual=processor.decode(output[:,inputs['input_ids'].shape[1]:],return_format='transcription_only')[0]
    print(json.dumps(dict(model=label,case=key,expected=item['text'],actual=actual,
        seconds=round(time.monotonic()-start,3)),ensure_ascii=False),flush=True)
