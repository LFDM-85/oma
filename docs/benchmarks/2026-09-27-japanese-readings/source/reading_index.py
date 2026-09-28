from pathlib import Path
import json,html
p=Path.home()/'.local/share/oma/comparisons/japanese-readings-v1'
a=json.loads((p/'slplab/comparison.json').read_text());b=json.loads((p/'sakasegawa/comparison.json').read_text());corpus=json.loads((p/'sakasegawa/corpus.json').read_text())
rows=[]
for voice in b['voices']:
 for speed in ['1','1.2']:
  x=a['voices'][voice][speed];y=b['voices'][voice][speed]
  rows.append(f'<tr><td>{voice}</td><td>{speed}</td><td>{x["phonetic_target_matches"]}/32</td><td>{y["phonetic_target_matches"]}/32</td></tr>')
sections=[]
for c in corpus['cases']:
 if c['id'] not in ['ja-reading-10','ja-reading-13','ja-reading-17','ja-reading-18','ja-reading-19','ja-reading-32']:continue
 cards=''.join(f'<div><h3>{v}</h3><audio controls preload="metadata" src="sakasegawa/{v}-{c["id"]}-1.2.wav"></audio></div>' for v in b['voices'])
 sections.append(f'<article><h2>{c["text"]}</h2><p>Expected: {html.escape(" / ".join(c["readings"]))}</p><section>{cards}</section></article>')
p.joinpath('index.html').write_text('''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>O.M.A. · Japanese reading test</title><style>body{font:17px/1.6 system-ui;margin:0;background:#101710;color:#e3ebdf}main{max-width:1000px;margin:auto;padding:30px 24px}h1{font-size:32px}h2{font-size:23px}h3{font-size:18px}p{color:#bccab5}a{color:#b0db95}nav{display:flex;gap:20px;flex-wrap:wrap;margin:24px 0}table{border-collapse:collapse}td,th{padding:10px 18px;border-bottom:1px solid #43553c;text-align:left}.table{overflow:auto}article{border-top:1px solid #43553c;margin-top:30px;padding-top:20px}section{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:20px}audio{width:100%}</style><main><h1>Japanese reading test</h1><p>32 sentences · 3 male voices · 2 speeds · 2 kana recognizers</p><p>At speed 1.20, both recognizers matched more target readings for Qwen. These counts are ASR proxies, not human-confirmed reading accuracy. Correct-kana controls also failed in some cases. No single model wins on every measure.</p><nav><a href="sakasegawa/index.html">All sentences · Recognizer B</a><a href="slplab/index.html">All sentences · Recognizer A</a><a href="sakasegawa/corpus.json">Expected readings</a></nav><div class="table"><table><tr><th>Voice</th><th>Speed</th><th>Recognizer A</th><th>Recognizer B</th></tr>'''+''.join(rows)+'''</table></div><p>Cells show phonetic target matches out of 32. Kokoro uses native synthesis speed. Qwen 0.6B uses pitch-preserving atempo after generation. Full details include unscorable results and controls. Naturalness and pitch accent have not been rated.</p><h2>Examples to review · Speed 1.20</h2><p>Kokoro's text frontend selected ヨンガツ, サンポン, キューガツ and シジ in these examples. This is separate from ASR errors. Ryan also produced a long corrupted readback on the temperature sentence; compare Uncle Fu.</p>'''+''.join(sections)+'''<script>for(const a of document.querySelectorAll('audio'))a.addEventListener('play',()=>{for(const b of document.querySelectorAll('audio'))if(b!==a)b.pause();});</script></main></html>''')
print(p/'index.html')
