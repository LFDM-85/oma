#!/usr/bin/env python3
"""Build a private static human review page from frozen synthesis runs."""
import argparse,hashlib,json,shutil
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--audio',nargs='+',type=Path,required=True);p.add_argument('--output',type=Path,required=True);a=p.parse_args()
base=Path(__file__).parent
corpus_bytes=(a.audio[0]/'corpus.json').read_bytes();corpus=json.loads(corpus_bytes);cases=corpus['cases'];ids={c['id'] for c in cases};samples=[];sources={}
for directory in a.audio:
 config=json.loads((directory/'config.json').read_text())
 if config['corpus_sha256']!=hashlib.sha256(corpus_bytes).hexdigest():raise ValueError('Corpus mismatch')
 for line in (directory/'results.jsonl').read_text().splitlines():
  row=json.loads(line)
  if row['id'] not in ids:continue
  name=row['file'];source=directory/name
  if Path(name).name!=name or hashlib.sha256(source.read_bytes()).hexdigest()!=row['sha256']:raise ValueError('Invalid audio checksum/path')
  if name in sources:raise ValueError('Duplicate audio')
  sources[name]=source;samples.append({'id':name,'case_id':row['id'],'voice':row['voice'],'speed':str(row['variant']),'file':name,'sha256':row['sha256']})
voices=sorted({x['voice'] for x in samples});speeds=sorted({x['speed'] for x in samples})
for c in cases:
 for v in voices:
  for speed in speeds:
   if sum(x['case_id']==c['id'] and x['voice']==v and x['speed']==speed for x in samples)!=1:raise ValueError('Incomplete sample matrix')
data={'cases':cases,'samples':samples,'corpus_sha256':hashlib.sha256(corpus_bytes).hexdigest()};data['id']=hashlib.sha256(json.dumps(data,sort_keys=True).encode()).hexdigest()
a.output.mkdir(parents=True,exist_ok=False)
for name,source in sources.items():shutil.copyfile(source,a.output/name)
(a.output/'dataset.json').write_text(json.dumps(data,ensure_ascii=False,indent=2))
for name in ['human-review-state.mjs','human-review.mjs']:shutil.copyfile(base/name,a.output/name)
shutil.copyfile(base/'human-review.html',a.output/'index.html')
print(f'{len(cases)} cases, {len(samples)} clips: {a.output}/index.html')
