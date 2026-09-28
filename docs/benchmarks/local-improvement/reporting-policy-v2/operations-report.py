#!/usr/bin/env python3
"""Acceptance reports retain all expected operations, including missing trials."""
import argparse,json
from pathlib import Path
from metrics import operations
p=argparse.ArgumentParser();p.add_argument('kind',choices=['agent','e2e']);p.add_argument('directory',type=Path);p.add_argument('--provider',default='local');a=p.parse_args()
rows=json.loads((a.directory/'results.json').read_text())
if a.kind=='agent':
    config=json.loads((a.directory/'config.json').read_text())
    assert config['split']=='final','Development observations cannot pass final acceptance'
    cases=[r['id'] for r in json.loads((Path(__file__).parent/'agent-cases.json').read_text())];repeats=5
else:
    cases=['document','empty','modes','logs','quoted-goodbye','interruption','idle','farewell','retained-document','empty-with-neighbor'];repeats=3
    rows=[r for r in rows if r.get('provider')==a.provider]
print(json.dumps({language:operations(cases,[r for r in rows if r['language']==language],repeats) for language in ['ja','en']},ensure_ascii=False,indent=2))
