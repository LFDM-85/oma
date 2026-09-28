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


def recognition_keywords(cases,results):
    """Additional lexical detail; never changes the fixed phrase acceptance gate."""
    score=recognition(cases,results)
    observed={row['id']:row for row in results}
    critical=[case for case in cases if case.get('critical')]
    count=sum(len(case['critical']) for case in critical)
    matched=0;failures=[]
    for case in critical:
        actual=observed.get(case['id'],{}).get('actual','')
        missing=[group for group in case['critical'] if not critical_match(actual,[group])]
        matched+=len(case['critical'])-len(missing)
        if missing:failures.append({'id':case['id'],'expected':case['text'],
                                    'actual':actual,'missing_groups':missing})
    return {'complete':score['complete'],'missing':score['missing'],'failed':score['failed'],
            'keyword_count':count,'matched_keywords':matched if score['complete'] else None,
            'keyword_accuracy':matched/count if count and score['complete'] else None,
            'phrase_accuracy':score['critical_accuracy'],'failures':failures,
            'limitation':'Lexical groups from the frozen corpus, not semantic intent classification.'}


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


def playback_timing(rows):
    """Digital audible-onset gate only; no inferred listening or gap approval."""
    report={}
    valid=lambda value:isinstance(value,(float,int)) and math.isfinite(value) and value>=0
    for language in ('ja','en'):
        groups={label:[r for r in rows if r.get('configuration')==label and r.get('language')==language] for label in ('baseline','candidate')}
        expected={f'{language}-final-{i:02}' for i in range(1,21)}
        complete=all(len(values)==20 and {r.get('id') for r in values}==expected for values in groups.values())
        if complete:
            texts=[{r['id']:r.get('text') for r in values} for values in groups.values()]
            complete=texts[0]==texts[1] and all(isinstance(v,str) and v for v in texts[0].values())
        failed=[r for values in groups.values() for r in values if r.get('errors') or not valid(r.get('monitor_first_sound_ms'))]
        timing={label:distribution([r['monitor_first_sound_ms'] for r in values if valid(r.get('monitor_first_sound_ms'))]) for label,values in groups.items()}
        old,new=timing['baseline'],timing['candidate']
        gain=1-new['median']/old['median'] if old['median'] and new['median'] is not None else None
        report[language]={'complete':complete,'baseline_first_sound_ms':old,'candidate_first_sound_ms':new,'relative_median_improvement':gain,
                          'timing_gate':bool(complete and not failed and gain is not None and gain>=.2 and new['p95']<=old['p95'] and new['max']<=old['max']),
                          'generation_ms':{label:distribution([r['generation_ms'] for r in values if valid(r.get('generation_ms'))]) for label,values in groups.items()},
                          'generation_rtf':{label:distribution([r['generation_rtf'] for r in values if valid(r.get('generation_rtf'))]) for label,values in groups.items()},
                          'failures':failed,'listening':'pending','capture_integrity':'separate waveform comparison required','physical_speaker':'not measured'}
    return report
