#!/usr/bin/env python3
"""Compare complete matched observations; never equate a proxy to listening."""
import argparse
import json
from pathlib import Path
from metrics import distribution


def read(directory):
    return [json.loads(line) for line in (directory/'results.jsonl').read_text().splitlines()]


def tts(before,after):
    result={}
    a,b=read(before),read(after)
    for lang in ('ja','en'):
        x=[r for r in a if r['language']==lang];y=[r for r in b if r['language']==lang]
        complete=len(x)==len(y)==20 and len({r['id'] for r in x})==20 and {r['id'] for r in x}=={r['id'] for r in y} and not any(r.get('error') or r.get('first_sound_seconds') is None or r.get('simulated_gap_seconds') is None for r in x+y)
        old=distribution([r['first_sound_seconds'] for r in x if r.get('first_sound_seconds') is not None]);new=distribution([r['first_sound_seconds'] for r in y if r.get('first_sound_seconds') is not None])
        gain=1-new['median']/old['median'] if old['median'] and new['median'] else None
        result[lang]={'complete':complete,'baseline_first_sound_seconds':old,'candidate_first_sound_seconds':new,'relative_median_improvement':gain,
                     'baseline_simulated_gap_seconds':sum(r.get('simulated_gap_seconds',0) for r in x),'candidate_simulated_gap_seconds':sum(r.get('simulated_gap_seconds',0) for r in y),
                     'timing_gate':bool(complete and gain>=.2 and new['p95']<=old['p95'] and new['max']<=old['max'] and sum(r['simulated_gap_seconds'] for r in y)<=sum(r['simulated_gap_seconds'] for r in x)),
                     'baseline_generation_seconds':distribution([r['seconds'] for r in x if r.get('seconds') is not None]),
                     'candidate_generation_seconds':distribution([r['seconds'] for r in y if r.get('seconds') is not None]),
                     'baseline_realtime_factor':distribution([r['seconds']/r['duration'] for r in x if r.get('seconds') is not None and r.get('duration',0)>0]),
                     'candidate_realtime_factor':distribution([r['seconds']/r['duration'] for r in y if r.get('seconds') is not None and r.get('duration',0)>0]),
                     'listening':'pending','physical_playback':'not measured','omissions':'requires readback and listening'}
    return result


def asr(before,after):
    a=json.loads((before/'summary.json').read_text());b=json.loads((after/'summary.json').read_text());result={}
    for lang in ('ja','en'):
        x,y=a[lang],b[lang];gain=1-y['cer']/x['cer'] if x['cer'] and y['cer'] is not None else None
        complete=x['complete'] and y['complete'] and x['speech_count']==y['speech_count']==50 and x['noise_count']==y['noise_count']==20
        result[lang]={'baseline':x,'candidate':y,'relative_cer_improvement':gain,'gate':bool(complete and gain is not None and gain>=.2 and y['critical_accuracy']>=x['critical_accuracy'] and y['false_activations']<=x['false_activations'])}
    return result

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('kind',choices=['tts','asr']);p.add_argument('baseline',type=Path);p.add_argument('candidate',type=Path)
    args=p.parse_args()
    a=json.loads((args.baseline/'config.json').read_text());b=json.loads((args.candidate/'config.json').read_text())
    assert a['corpus_sha256']==b['corpus_sha256'],'Cannot compare different corpora'
    assert a['split']==b['split']=='final','Acceptance requires the final split'
    print(json.dumps(globals()[args.kind](args.baseline,args.candidate),ensure_ascii=False,indent=2))
