#!/usr/bin/env python3
"""Summarize sampled residency without confusing RAM and GPU allocations."""
import argparse,json
from pathlib import Path
p=argparse.ArgumentParser(description=__doc__);p.add_argument('samples',type=Path);a=p.parse_args()
rows=[json.loads(line) for line in a.samples.read_text().splitlines()]
models={}
for row in rows:
 for model in row.get('ollama',[]):
  key=model.get('name',model.get('model','unknown'))
  entry=models.setdefault(key,{'digest':model.get('digest'),'samples':0,'peak_allocation_bytes':0,'peak_vram_allocation_bytes':0,'context_lengths':[]})
  entry['samples']+=1
  entry['peak_allocation_bytes']=max(entry['peak_allocation_bytes'],model.get('size',0))
  entry['peak_vram_allocation_bytes']=max(entry['peak_vram_allocation_bytes'],model.get('size_vram',0))
  if model.get('context_length') not in entry['context_lengths']:entry['context_lengths'].append(model.get('context_length'))
ram=[sum(r['rss_kib'] for r in row['runners']) for row in rows if row.get('runners')]
vram=[sum(g['used'] for g in row['device_vram_mib']) for row in rows if row.get('device_vram_mib')]
print(json.dumps({'samples':len(rows),'errors':sum('error' in r for r in rows),
 'sampled_span_seconds':rows[-1]['unix_seconds']-rows[0]['unix_seconds'] if len(rows)>1 else None,
 'peak_runner_rss_kib':max(ram) if ram else None,
 'peak_whole_device_vram_mib':max(vram) if vram else None,
 'models':models,'limitation':'Sampled peaks only. Unsampled startup is not inferred. Whole-device VRAM includes desktop and other processes; model allocation is a separate server estimate.'},indent=2))
