#!/usr/bin/env python3
"""Compare TTS configurations without equating ASR proxies with human listening."""
import argparse
import json
from pathlib import Path
from corpus import cases, corpus_hash
from metrics import distribution


def compare(directories, readback):
    result = {'scope': 'CPU configurations; API output timing, not physical playback',
              'listening': 'pending', 'models': {}}
    back = [json.loads(s) for s in readback.read_text().splitlines()]
    for directory in directories:
        config = json.loads((directory/'config.json').read_text())
        assert config['split'] == 'final' and config['corpus_sha256'] == corpus_hash()
        rows = [json.loads(s) for s in (directory/'results.jsonl').read_text().splitlines()]
        ids = [r['id'] for r in rows]
        if len(ids) != len(set(ids)):raise ValueError('Duplicate synthesis result')
        entry = {'configuration': config, 'languages': {}}
        for lang in ['ja', 'en']:
            expected = {c['id']: c['text'] for c in cases(lang, 'final')[:20]}
            subset = [r for r in rows if r['language'] == lang]
            observed = {r['id']: r for r in subset}
            if set(observed)-set(expected):raise ValueError('Unexpected synthesis case')
            if any(r['text'] != expected[r['id']] for r in subset):raise ValueError('Changed synthesis text')
            missing = sorted(set(expected)-set(observed))
            errors = [r for r in subset if r.get('error')]
            heard = [r for r in back if r['configuration'] == directory.name and r['language'] == lang]
            heard_ids = [r['id'] for r in heard]
            if len(set(heard_ids)) != len(heard_ids) or set(heard_ids)-set(expected):raise ValueError('Invalid readback cases')
            if any(r['expected'] != expected[r['id']] for r in heard):raise ValueError('Changed readback reference')
            back_complete = set(heard_ids) == set(expected) and not any(r.get('error') for r in heard)
            chars = sum(r['reference_chars'] for r in heard)
            score = {'expected': len(expected), 'complete': not missing and not errors, 'missing': missing, 'errors': errors,
                     'first_sound_seconds': distribution([r['first_sound_seconds'] for r in subset if not r.get('error')]),
                     'generation_seconds': distribution([r['seconds'] for r in subset if not r.get('error')]),
                     'rtf': distribution([r['rtf'] for r in subset if not r.get('error')]),
                     'simulated_gap_seconds': sum(r.get('simulated_gap_seconds',0) for r in subset),
                     'readback_complete': back_complete,
                     'readback_cer_proxy': sum(r['edits'] for r in heard)/chars if back_complete and chars else None,
                     'readback_differences': [r for r in heard if r.get('edits')],
                     'listening': 'pending', 'acoustic_dropouts': 'not measured'}
            entry['languages'][lang] = score
        result['models'][directory.name] = entry
    return result

if __name__ == '__main__':
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('directories', nargs='+', type=Path)
    p.add_argument('--readback', type=Path, required=True)
    p.add_argument('--output', type=Path, required=True)
    a = p.parse_args()
    if a.output.exists():p.error('Use a new output file')
    a.output.write_text(json.dumps(compare(a.directories, a.readback), ensure_ascii=False, indent=2)+'\n')
    print(a.output)
