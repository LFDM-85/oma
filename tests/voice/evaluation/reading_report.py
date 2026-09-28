#!/usr/bin/env python3
"""Report every frozen reading case, including failures and explicit controls."""
import argparse,collections,hashlib,html,json,shutil,importlib.metadata
from pathlib import Path
from reading_metrics import normalize,score,summarize,phonetic_target_match
p=argparse.ArgumentParser();p.add_argument('--readback',type=Path,required=True);p.add_argument('--audio',nargs='+',type=Path,required=True);p.add_argument('--output',type=Path,required=True);a=p.parse_args()
a.output.mkdir(parents=True,exist_ok=False)
corpus=json.loads((a.readback/'corpus.json').read_text());rows=[json.loads(s) for s in (a.readback/'results.jsonl').read_text().splitlines()]
case_map={c['id']:c for c in corpus['cases']+corpus['controls']}
expected_voices=[]
for d in a.audio:
 cfg=json.loads((d/'config.json').read_text());expected_voices+=cfg['voices']
 assert cfg['corpus_sha256']==hashlib.sha256((a.readback/'corpus.json').read_bytes()).hexdigest()
for r in rows:
 if r['id'] not in case_map:raise ValueError('Unexpected case')
 if r['text']!=case_map[r['id']]['text']:raise ValueError('Changed synthesis text')
 if not r.get('error'):
  try:normalize(r['actual'])
  except ValueError as e:r['error']=str(e)
summary={'scorer_sha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'metrics_sha256':hashlib.sha256((Path(__file__).parent/'reading_metrics.py').read_bytes()).hexdigest(),'pyopenjtalk_version':importlib.metadata.version('pyopenjtalk'),'scope':'Japanese reading, 32 fixed cases; kana ASR proxies, human listening pending','voices':{},'controls':[],'readback_model':json.loads((a.readback/'config.json').read_text())['model'],'speed_note':'Kokoro native synthesis speed; Qwen 0.6B ffmpeg atempo after generation. No latency ranking.'}
for voice in expected_voices:
 entry={}
 for variant in ['1','1.2']:
  subset=[r for r in rows if r['voice']==voice and r.get('variant')==variant and r['id'] in {c['id'] for c in corpus['cases']}]
  s=summarize(corpus['cases'],subset)
  s['target_matches']=sum(not r.get('error') and any(normalize(t) in normalize(r['actual']) for t in case_map[r['id']]['targets']) for r in subset)
  s['phonetic_target_matches']=sum(not r.get('error') and phonetic_target_match(case_map[r['id']]['targets'],r['actual']) for r in subset)
  s['unscorable']=len(s['errors'])+len(s['missing'])
  s['phonetic_target_match_rate']=s['phonetic_target_matches']/len(corpus['cases']) if s['complete'] else None
  s['kana_target_match_rate']=s['target_matches']/len(corpus['cases']) if s['complete'] else None
  s['categories']={}
  for cat in sorted({c['category'] for c in corpus['cases']}):
   cs=[c for c in corpus['cases'] if c['category']==cat];rs=[r for r in subset if case_map[r['id']]['category']==cat]
   s['categories'][cat]={'count':len(cs),'target_matches':sum(not r.get('error') and any(normalize(t) in normalize(r['actual']) for t in case_map[r['id']]['targets']) for r in rs),'phonetic_target_matches':sum(not r.get('error') and phonetic_target_match(case_map[r['id']]['targets'],r['actual']) for r in rs)}
  entry[variant]=s
 summary['voices'][voice]=entry
for voice in expected_voices:
 for variant in ['1','1.2']:
  for c in corpus['controls']:
   found=[r for r in rows if r['voice']==voice and r.get('variant')==variant and r['id']==c['id']]
   assert len(found)<=1
   r=found[0] if found else {'error':'Missing control'}
   match=not r.get('error') and phonetic_target_match(c['targets'],r['actual'])
   summary['controls'].append(dict(voice=voice,variant=variant,id=c['id'],purpose=c['purpose'],target_matched=match,control_pass=not r.get('error') and match==('wrong' not in c['id']),actual=r.get('actual'),error=r.get('error')))
(a.output/'comparison.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n')
shutil.copy2(a.readback/'corpus.json',a.output/'corpus.json')
for d in a.audio:
 for f in d.glob('*.wav'):shutil.copy2(f,a.output/f.name)
sections=[]
for c in corpus['cases']+corpus['controls']:
 cards=[]
 for voice in expected_voices:
  r=next((r for r in rows if r['voice']==voice and r.get('variant')=='1.2' and r['id']==c['id']),{})
  match=not r.get('error') and bool(r) and phonetic_target_match(c['targets'],r.get('actual',''))
  audio=f'<audio controls preload="none" src="{html.escape(r["file"])}"></audio>' if r.get('file') else ''
  cards.append(f'<div><h3>{html.escape(voice)}</h3>{audio}<p class="{"match" if match else "review"}">{"Target matched" if match else "Review needed"}</p><p>ASR: {html.escape(r.get("actual",r.get("error","Missing result")))}</p></div>')
 sections.append(f'<article><small>{c["id"]} · {c.get("category","control")}</small><h2>{html.escape(c["text"])}</h2><p>Expected: {html.escape(" / ".join(c["readings"]))}</p><p>Target: {html.escape(" / ".join(c["targets"]))}</p><section>{"".join(cards)}</section></article>')
trs=[]
for voice,e in summary['voices'].items():
 for variant,s in e.items():
  cer=f'{s["kana_error_rate"]*100:.2f}%' if s['kana_error_rate'] is not None else 'Incomplete'
  trs.append(f'<tr><td>{voice}</td><td>{variant}</td><td>{s["phonetic_target_matches"]}/32</td><td>{cer}</td><td>{s["exact"]}/32</td></tr>')
(a.output/'index.html').write_text('''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>O.M.A. · Japanese readings</title><style>body{background:#101710;color:#e4ebdf;font:16px/1.6 system-ui;margin:0}main{max-width:1100px;margin:auto;padding:28px}h1{font-size:30px}h2{font-size:21px}h3{font-size:18px}p,small{color:#b7c7af}table{border-collapse:collapse}td,th{padding:8px 16px;border-bottom:1px solid #40503a;text-align:left}article{border-top:1px solid #40503a;margin-top:30px;padding-top:22px}section{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:24px}audio{width:100%}.match{color:#a8df92}.review{color:#f3c17e}.table{overflow:auto}a{color:#a8df92}</style><main><h1>Japanese reading comparison</h1><p>32 frozen sentences with assistant-authored expected readings. All samples below are at speed 1.20. Kokoro uses native speed; Qwen uses pitch-preserving ffmpeg atempo. Standard-speed results are shown separately.</p><p>These are acoustic kana-ASR proxies, not human-confirmed pronunciation accuracy. No kanji-to-kana guessing is used. Long vowels and small kana can be misrecognized. Target match compares phoneme substrings of kana, accepting long-vowel spelling and devoicing variants; kana CER also penalizes recognizer errors. Pitch accent and naturalness are not scored. Context cases measure the intended interpretation; some expressions admit other readings. Non-kana ASR outputs remain unscorable and are not converted to guessed readings. Negative controls deliberately contain a wrong reading.</p><div class="table"><table><tr><th>Voice</th><th>Speed</th><th>Phonetic target match</th><th>Kana CER</th><th>Exact sentence</th></tr>'''+''.join(trs)+'''</table></div><p><a href="comparison.json">Full results</a> · <a href="corpus.json">Frozen references and accepted variants</a> · <a href="https://huggingface.co/slplab/wav2vec2-xls-r-300m-japanese-hiragana">Kana recognizer</a></p>'''+''.join(sections)+'''<script>for(const a of document.querySelectorAll('audio'))a.addEventListener('play',()=>{for(const b of document.querySelectorAll('audio'))if(b!==a)b.pause();});</script></main></html>''')
page=a.output/'index.html'
text=page.read_text().replace('https://huggingface.co/slplab/wav2vec2-xls-r-300m-japanese-hiragana','https://huggingface.co/'+summary['readback_model'])
text=text.replace('<h1>Japanese reading comparison</h1>','<h1>Japanese reading comparison</h1><p>Readback: '+html.escape(summary['readback_model'])+'</p>')
page.write_text(text)
print(a.output/'index.html')
