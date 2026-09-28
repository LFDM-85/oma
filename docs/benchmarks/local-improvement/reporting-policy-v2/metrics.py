"""Model-independent scores. Missing or failed observations never disappear."""
import math
import statistics
import unicodedata


def normalize(text):
    text=unicodedata.normalize('NFKC',text).casefold()
    return ''.join(c for c in text if not unicodedata.category(c).startswith(('P','Z')))


def distance(a,b):
    row=list(range(len(b)+1))
    for i,x in enumerate(a,1):
        nxt=[i]
        for j,y in enumerate(b,1):
            nxt.append(min(nxt[-1]+1,row[j]+1,row[j-1]+(x!=y)))
        row=nxt
    return row[-1]


def critical_match(actual,groups):
    text=normalize(actual)
    return all(any(normalize(option) in text for option in group) for group in groups)


def distribution(values):
    values=sorted(values)
    return {'n':len(values),'median':statistics.median(values) if values else None,
            'p95':values[max(0,math.ceil(len(values)*.95)-1)] if values else None,
            'max':max(values) if values else None}


def recognition(cases,results):
    observed={}
    for row in results:
        if row['id'] in observed:raise ValueError('Duplicate result: '+row['id'])
        observed[row['id']]=row
    missing=[c['id'] for c in cases if c['id'] not in observed]
    failed=[c['id'] for c in cases if observed.get(c['id'],{}).get('error')]
    speech=[c for c in cases if c['text']]
    noise=[c for c in cases if not c['text']]
    critical=[c for c in speech if c.get('critical')]
    actual=lambda c:observed.get(c['id'],{}).get('actual','')
    complete=not missing and not failed
    count=sum(len(normalize(c['text'])) for c in speech)
    edits=sum(distance(normalize(c['text']),normalize(actual(c))) for c in speech)
    return {'complete':complete,'missing':missing,'failed':failed,'speech_count':len(speech),
            'noise_count':len(noise),'reference_chars':count,'edits':edits if complete else None,
            'cer':edits/count if count and complete else None,
            'critical_count':len(critical),
            'critical_accuracy':sum(critical_match(actual(c),c['critical']) for c in critical)/len(critical) if critical and complete else None,
            'false_activations':sum(bool(actual(c).strip()) for c in noise) if complete else None,
            'latency':distribution([observed[c['id']]['seconds'] for c in speech if c['id'] in observed and 'seconds' in observed[c['id']]])}


def playback_gaps(chunks):
    end=None;gaps=0
    for c in chunks:
        if end is None:end=c['ready']
        gaps+=max(0,c['ready']-end)
        end=max(end,c['ready'])+c['duration']
    return gaps


def critical_operation(row):
    # Earlier harnesses flagged this as an ordinary failure. Preserve raw rows,
    # but never let a wrong O.M.A. window closure satisfy zero-critical acceptance.
    message='O.M.A. ended the conversation instead of completing the requested operation'
    return bool(row.get('critical_error')) or row.get('error') in (message,str([message]))


def operations(case_ids,results,repeats,minimum_successes=None):
    expected={(case,repeat) for case in case_ids for repeat in range(repeats)}
    observed={}
    for row in results:
        key=(row.get('id',row.get('case')),row.get('repeat',0))
        if key in observed:raise ValueError('Duplicate operation result: '+str(key))
        if key not in expected:raise ValueError('Unexpected operation result: '+str(key))
        observed[key]=row
    missing=[{'id':case,'repeat':repeat} for case,repeat in sorted(expected) if (case,repeat) not in observed or observed[case,repeat]['status'] in ('not_run','running','interrupted')]
    successes=sum(r['status']=='passed' for r in observed.values())
    critical_rows=[r for r in observed.values() if critical_operation(r)]
    critical=len(critical_rows)
    threshold=minimum_successes if minimum_successes is not None else math.ceil(len(expected)*.9)
    return {'complete':not missing,'expected':len(expected),'successes':successes,'success_rate':successes/len(expected) if expected else None,'missing':missing,'critical_policy':'explicit-flags-and-wrong-assistant-dismissal-v2','critical_errors':critical,'critical_failures':critical_rows,'gate':bool(expected and not missing and successes>=threshold and critical==0),'successful_latency':distribution([r['seconds'] for r in observed.values() if r['status']=='passed' and r.get('seconds') is not None]),'failed_duration':distribution([r['seconds'] for r in observed.values() if r['status']!='passed' and r.get('seconds') is not None]),'failures':[r for r in observed.values() if r['status']!='passed']}
