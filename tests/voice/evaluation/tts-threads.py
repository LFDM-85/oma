#!/usr/bin/env python3
"""Development-only CPU thread sweep; does not modify the runtime worker."""
import importlib.util
import json
import os
from pathlib import Path
import time
import torch
import numpy as np
from corpus import cases
home=Path.home()/'.local/share/oma/local'
os.environ['HF_HOME']=str(home/'huggingface');os.environ['HF_HUB_OFFLINE']='1';os.environ['TRANSFORMERS_OFFLINE']='1'
worker=Path(__file__).resolve().parents[3]/'runtime/local-speech.py'
spec=importlib.util.spec_from_file_location('local_speech',worker);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
engine=module.Engines(home)
# Warm voices and all development texts once, then rotate configurations.
for lang in ('ja','en'):
    for c in cases(lang,'dev')[:4]:list(engine.speak(c['text'],lang))
original=torch.set_num_threads
for repeat,order in enumerate([(4,2,1,8),(8,1,2,4),(2,4,8,1)]):
    for threads in order:
        original(threads)
        # Override only the worker's fixed setting for this isolated probe.
        torch.set_num_threads=lambda n:None
        try:
            for lang in ('ja','en'):
                for c in cases(lang,'dev')[:4]:
                    start=time.monotonic();first=None;count=0
                    for pcm in engine.speak(c['text'],lang):
                        if first is None:first=time.monotonic()-start
                        count+=len(pcm)
                    print(json.dumps({'threads':threads,'repeat':repeat,'language':lang,'id':c['id'],'first':first,'seconds':time.monotonic()-start,'bytes':count}),flush=True)
        finally:torch.set_num_threads=original
