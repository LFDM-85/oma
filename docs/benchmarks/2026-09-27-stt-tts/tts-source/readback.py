#!/usr/bin/env python3
"""Paired ASR readback of generated speech; explicitly not a listening verdict."""
import argparse
import json
import os
from pathlib import Path
from metrics import normalize,distance
p=argparse.ArgumentParser();p.add_argument('directories',nargs='+',type=Path);p.add_argument('--output',type=Path,required=True)
a=p.parse_args();assert not a.output.exists()
os.environ['HF_HUB_OFFLINE']='1'
from faster_whisper import WhisperModel
model=WhisperModel(str(Path.home()/'.local/share/oma/local/whisper-turbo-comparison'),device='cpu',compute_type='int8',cpu_threads=4,local_files_only=True)
with a.output.open('w') as f:
    for directory in a.directories:
        for row in map(json.loads,(directory/'results.jsonl').read_text().splitlines()):
            segments,_=model.transcribe(str(directory/(row['id']+'.wav')),language=row['language'],beam_size=5,vad_filter=True,condition_on_previous_text=False)
            actual=''.join(s.text for s in segments).strip()
            result={'configuration':directory.name,'id':row['id'],'language':row['language'],'expected':row['text'],'actual':actual,'edits':distance(normalize(row['text']),normalize(actual)),'reference_chars':len(normalize(row['text'])),'interpretation':'ASR proxy; no subjective listening verdict'}
            f.write(json.dumps(result,ensure_ascii=False)+'\n');f.flush();print(json.dumps(result,ensure_ascii=False),flush=True)
