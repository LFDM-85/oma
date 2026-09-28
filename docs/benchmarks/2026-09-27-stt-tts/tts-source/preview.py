#!/usr/bin/env python3
"""Standalone blind A/B listening artifact. No external assets or network calls."""
import argparse
import base64
import hashlib
import html
import json
from pathlib import Path
import random

p=argparse.ArgumentParser();p.add_argument('baseline',type=Path);p.add_argument('candidate',type=Path);p.add_argument('--output',type=Path,required=True)
p.add_argument('--baseline-label',default='4 CPU threads')
p.add_argument('--candidate-label',default='up to 8 CPU threads, only exact leading digital silence shortened')
p.add_argument('--description',default='Both use the same voice and speaking speed.')
a=p.parse_args();a.output.mkdir(parents=True,exist_ok=False)
old=[json.loads(x) for x in (a.baseline/'results.jsonl').read_text().splitlines()];new={x['id']:x for x in map(json.loads,(a.candidate/'results.jsonl').read_text().splitlines())}
rows=[];key={};rng=random.Random(20260926);dataset=hashlib.sha256()
for r in old:
    c=new[r['id']];assert c['text']==r['text']
    order=[('baseline',a.baseline),('candidate',a.candidate)];rng.shuffle(order)
    key[r['id']]={label:name for label,(name,_) in zip(['A','B'],order)}
    players=[]
    for label,(name,directory) in zip(['A','B'],order):
        audio=(directory/(r['id']+'.wav')).read_bytes()
        dataset.update(json.dumps([r['id'],r['text'],name],ensure_ascii=False).encode());dataset.update(audio)
        data=base64.b64encode(audio).decode()
        players.append(f'<div><b>{label}</b><audio controls preload="metadata" src="data:audio/wav;base64,{data}"></audio></div>')
    identity=html.escape(r['id']);text=html.escape(r['text'])
    rows.append(f'<article data-language="{r["language"]}" data-id="{identity}"><small>{identity}</small><p>{text}</p><div class="players">'+''.join(players)+f'</div><label>Preference <select data-score="preference"><option value="">Not rated</option><option>A</option><option>B</option><option>No difference</option></select></label> <label>Missing or unclear words <input data-score="notes" placeholder="Optional notes"></label></article>')
page='''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>O.M.A. Voice Comparison</title>
<style>body{background:#0d120e;color:#d8e5d6;font:17px system-ui;margin:0}main{max-width:900px;margin:auto;padding:32px 20px}h1{font-weight:500}p{line-height:1.6}small{color:#869980}article{padding:24px 0;border-bottom:1px solid #344030}.players{display:flex;gap:24px;margin:18px 0}.players>div{display:flex;align-items:center;gap:12px;min-width:0;flex:1}audio{width:100%;height:40px}select,input,button{font:inherit;color:inherit;background:#192318;border:1px solid #59664e;border-radius:5px;padding:8px}input{max-width:240px}label{display:inline-block;margin:6px 0}nav{display:flex;gap:12px;flex-wrap:wrap}button{cursor:pointer}article[hidden]{display:none}@media(max-width:620px){.players{flex-direction:column}input{max-width:170px}}</style>
<main><h1>Voice comparison</h1><p>Listen to A and B, then rate clarity and preference. '''+html.escape(a.description)+''' These are cached samples; playback does not demonstrate generation latency.</p><nav><select id="language"><option value="ja">Japanese</option><option value="en">English</option></select><button id="export">Export ratings</button><button id="reveal">Reveal versions</button></nav><p id="versions"></p>'''+''.join(rows)+'''</main><script>
const key=KEY;
const labels=LABELS;
const datasetId=DATASET;
const storageKey='oma-listening-'+datasetId;
const saved=JSON.parse(localStorage.getItem(storageKey)||'{}');
for(const card of document.querySelectorAll('article'))for(const field of card.querySelectorAll('[data-score]')){
 field.value=saved[card.dataset.id]?.[field.dataset.score]||'';
 field.addEventListener('change',()=>{saved[card.dataset.id]??={};saved[card.dataset.id][field.dataset.score]=field.value;localStorage.setItem(storageKey,JSON.stringify(saved));});
}
const filter=()=>{for(const card of document.querySelectorAll('article'))card.hidden=card.dataset.language!==document.querySelector('#language').value;};filter();document.querySelector('#language').onchange=filter;
document.querySelector('#export').onclick=()=>{const blob=new Blob([JSON.stringify({version:2,dataset_sha256:datasetId,ratings:saved},null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='oma-listening-ratings.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);};
document.querySelector('#reveal').onclick=()=>{for(const card of document.querySelectorAll('article')){let p=document.createElement('p');p.textContent=Object.entries(key[card.dataset.id]).map(([a,b])=>a+': '+labels[b]).join(' / ');card.append(p);}document.querySelector('#reveal').disabled=true;document.querySelector('#versions').textContent='Listening ratings remain your own. Voice identity may affect preference; this is not a matched-speaker quality benchmark.';};
</script></html>'''.replace('KEY',json.dumps(key)).replace('LABELS',json.dumps({'baseline':a.baseline_label,'candidate':a.candidate_label}).replace('<','\\u003c')).replace('DATASET',json.dumps(dataset.hexdigest()))
(a.output/'index.html').write_text(page)
(a.output/'dataset.json').write_text(json.dumps({'sha256':dataset.hexdigest(),'pairs':len(rows)},indent=2)+'\n')
(a.output/'answer-key.json').write_text(json.dumps(key,indent=2)+'\n')
print(a.output/'index.html')
