#!/usr/bin/env python3
"""Opt-in local Japanese ASR comparison. No downloads or production changes."""
import argparse
import json
import time
import unicodedata
from pathlib import Path
import numpy as np
from faster_whisper import WhisperModel


def normalized(text):
    text=unicodedata.normalize('NFKC',text).lower().replace('omatext','オマテキスト')
    return ''.join(c for c in text if not unicodedata.category(c).startswith(('P','Z')))


def distance(a,b):
    row=list(range(len(b)+1))
    for i,x in enumerate(a,1):
        nxt=[i]
        for j,y in enumerate(b,1):
            nxt.append(min(nxt[-1]+1,row[j]+1,row[j-1]+(x!=y)))
        row=nxt
    return row[-1]


parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--fixtures',type=Path,default=Path('/tmp/oma-voice-fixtures/ja'))
parser.add_argument('--models',nargs='+',required=True,help='label=/path/to/CTranslate2/model')
args=parser.parse_args()
phrases=json.loads((args.fixtures/'manifest.json').read_text())['phrases']
for entry in args.models:
    label,path=entry.split('=',1)
    start=time.monotonic()
    model=WhisperModel(path,device='cpu',compute_type='int8',cpu_threads=4,local_files_only=True)
    print(json.dumps(dict(model=label,load_seconds=time.monotonic()-start)),flush=True)
    inputs=[(key,str(args.fixtures/item['file']),item['text']) for key,item in phrases.items()]
    inputs += [('silence',np.zeros(48000,dtype=np.float32),'')]
    inputs += [('quiet-noise',np.random.default_rng(0).normal(0,.001,48000).astype(np.float32),'')]
    for key,audio,expected in inputs:
        start=time.monotonic()
        segments,_=model.transcribe(audio,language='ja',beam_size=5,vad_filter=True,
            condition_on_previous_text=False,
            initial_prompt='Voice commands to the O.M.A. desktop assistant. Applications, documents, conversation history. O.M.A., OmaText.')
        actual=''.join(s.text for s in segments).strip()
        ref,hyp=normalized(expected),normalized(actual)
        print(json.dumps(dict(model=label,case=key,expected=expected,actual=actual,
            seconds=round(time.monotonic()-start,3),edits=distance(ref,hyp),reference_chars=len(ref),
            normalized_exact=ref==hyp),ensure_ascii=False),flush=True)
    del model
