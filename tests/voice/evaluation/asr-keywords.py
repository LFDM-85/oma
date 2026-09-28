#!/usr/bin/env python3
"""Report frozen critical-word groups separately from whole-phrase recognition."""
import argparse,hashlib,json
from pathlib import Path
from corpus import cases,noise_cases,corpus_hash
from metrics import recognition_keywords

p=argparse.ArgumentParser(description=__doc__)
p.add_argument('directory',type=Path)
a=p.parse_args()
config=json.loads((a.directory/'config.json').read_text())
assert config['split']=='final' and config['corpus_sha256']==corpus_hash()
raw=(a.directory/'results.jsonl').read_bytes()
rows=[json.loads(line) for line in raw.splitlines()]
expected={c['id'] for language in ['ja','en'] for c in cases(language,'final')+noise_cases(language)}
assert all(row['id'] in expected for row in rows),'Unexpected observation'
print(json.dumps({'corpus_sha256':corpus_hash(),'results_sha256':hashlib.sha256(raw).hexdigest(),
 'languages':{language:recognition_keywords(cases(language,'final')+noise_cases(language),
   [row for row in rows if row['language']==language]) for language in ['ja','en']}},ensure_ascii=False,indent=2))
