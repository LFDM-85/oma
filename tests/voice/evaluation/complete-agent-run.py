#!/usr/bin/env python3
"""Combine an interrupted matrix with same-condition, never-run trials only.

Inputs remain immutable. The new directory records both complete source runs;
failed, interrupted, or already completed trials can never be replaced.
"""
import argparse
import json
from pathlib import Path
import shutil


def complete_rows(original, supplement, offset):
    key=lambda r:(r['language'],r['repeat'],r['id'])
    rows={key(r):dict(r) for r in original}
    if len(rows)!=len(original):raise ValueError('Duplicate original trial')
    for row in supplement:
        mapped={**row,'repeat':row['repeat']+offset}
        k=key(mapped)
        if k not in rows or rows[k]['status']!='not_run':
            raise ValueError('Only a never-run original trial may be supplemented: '+str(k))
        if row['status'] not in ('passed','failed'):raise ValueError('Supplement trial is incomplete')
        rows[k]=mapped
    return list(rows.values())


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('original',type=Path);p.add_argument('supplement',type=Path)
    p.add_argument('--repeat-offset',type=int,required=True)
    p.add_argument('--output',type=Path,required=True)
    a=p.parse_args()
    read=lambda root,name:json.loads((root/name).read_text())
    configs=[read(root,'config.json') for root in (a.original,a.supplement)]
    for name in ('source-hashes.json','harness-hashes.json'):
        if read(a.original,name)!=read(a.supplement,name):raise ValueError('Changed code: '+name)
    for key in set(configs[0])|set(configs[1]):
        if key not in ('repeat','languages') and configs[0].get(key)!=configs[1].get(key):
            raise ValueError('Changed condition: '+key)
    rows=complete_rows(read(a.original,'results.json'),read(a.supplement,'results.json'),a.repeat_offset)
    a.output.mkdir(parents=True,exist_ok=False)
    for label,root in [('original-run',a.original),('supplement-run',a.supplement)]:
        # Keep complete evidence without copying private agent session databases.
        for source in root.rglob('*'):
            if source.is_file() and not source.is_symlink() and source.name in {
                'config.json','environment.json','source-hashes.json','harness-hashes.json',
                'results.json','memory.jsonl','ui-selection.json','selection-wrapper.py',
                'stdout.jsonl','stderr.log','note.txt','renamed.txt','original-settings.json'}:
                target=a.output/label/source.relative_to(root)
                target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(source,target)
    for name in ('config.json','environment.json','source-hashes.json','harness-hashes.json'):
        shutil.copy2(a.original/name,a.output/name)
    (a.output/'results.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2)+'\n')
    (a.output/'completion.json').write_text(json.dumps({
        'original':str(a.original.resolve()),'supplement':str(a.supplement.resolve()),
        'repeat_offset':a.repeat_offset,'policy':'replace not_run only; no rescoring or retries',
        'command':['complete-agent-run.py',str(a.original),str(a.supplement),'--repeat-offset',str(a.repeat_offset),'--output',str(a.output)]
    },indent=2)+'\n')


if __name__=='__main__':main()
