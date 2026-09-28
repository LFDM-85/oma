#!/usr/bin/env python3
"""STT-only offline model comparison. Never starts O.M.A., LLMs or TTS."""
import argparse
import collections
import hashlib
import html
import json
import os
from pathlib import Path
import platform
import re
import shutil
import subprocess
import sys
import unicodedata

from metrics import recognition, recognition_keywords, distribution, distance, normalize

LOCAL = Path.home() / '.local/share/oma/local'
MODELS = {
    'whisper-small': ('whisper', LOCAL/'whisper', ['ja', 'en']),
    'whisper-turbo': ('whisper', LOCAL/'whisper-turbo-comparison', ['ja', 'en']),
    'qwen-0.6b': ('qwen', 'Qwen/Qwen3-ASR-0.6B-hf', ['ja', 'en']),
    'qwen-1.7b': ('qwen', 'Qwen/Qwen3-ASR-1.7B-hf', ['ja', 'en']),
    'kotoba-v2': ('whisper', LOCAL/'comparison/kotoba-whisper-v2', ['ja']),
}


def words(text):
    return re.findall(r"\w+(?:['’]\w+)*", unicodedata.normalize('NFKC', text).casefold())


def score(cases, rows, language, groups=True):
    cases = [c for c in cases if c['language'] == language]
    rows = [r for r in rows if r['language'] == language]
    if set(r['id'] for r in rows) - set(c['id'] for c in cases):
        raise ValueError('Unexpected observation')
    result = recognition(cases, rows)
    result['keywords'] = recognition_keywords(cases, rows)
    observed = {r['id']: r for r in rows}
    speech = [c for c in cases if c['text']]
    pairs = [(c['text'], observed.get(c['id'], {}).get('actual', '')) for c in speech]
    result['literal_exact_count'] = sum(a == b for a, b in pairs) if result['complete'] else None
    result['normalized_exact_count'] = sum(normalize(a) == normalize(b) for a, b in pairs) if result['complete'] else None
    word_count = sum(len(words(a)) for a, _ in pairs)
    result['wer'] = sum(distance(words(a), words(b)) for a, b in pairs)/word_count if language == 'en' and word_count and result['complete'] else None
    result['rtf'] = distribution([observed[c['id']]['seconds']/observed[c['id']]['duration'] for c in speech if c['id'] in observed and observed[c['id']].get('duration', 0) > 0 and 'seconds' in observed[c['id']] and not observed[c['id']].get('error')])
    result['sources'] = dict(collections.Counter(c['source'] for c in cases))
    if groups:
        for key in ['source', 'condition']:
            result['by_'+key] = {}
            for value in sorted(set(c[key] for c in cases)):
                subset = [c for c in cases if c[key] == value]
                ids = {c['id'] for c in subset}
                result['by_'+key][value] = score(subset, [r for r in rows if r['id'] in ids], language, False)
    return result


def write_report(output, data):
    (output/'comparison.json').write_text(json.dumps(data, ensure_ascii=False, indent=2)+'\n')
    esc = lambda value: html.escape(str(value))
    num = lambda value: '—' if value is None else f'{value:.3f}'
    percent = lambda value: '—' if value is None else f'{value*100:.2f}%'
    body = []
    for run in data['runs']:
        meta = run['metadata']
        for lang, s in run['scores'].items():
            cells = [run['model'], lang, run['repeat']+1, 'complete' if s['complete'] else 'incomplete', percent(s['cer']), percent(s['wer']), percent(s['critical_accuracy']), s['false_activations'], num(s['latency']['median']), num(s['latency']['p95']), num(s['rtf']['median']), num(meta.get('peak_rss_kib', 0)/1048576) if meta.get('peak_rss_kib') else '—']
            body.append('<tr>'+''.join('<td>'+esc(v)+'</td>' for v in cells)+'</tr>')
    failures = ''.join('<details><summary>'+esc(r['model'])+' · run '+str(r['repeat']+1)+'</summary><pre>'+esc(json.dumps(r['failures'], ensure_ascii=False, indent=2))+'</pre></details>' for r in data['runs'])
    page = '''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>O.M.A. STT comparison</title><style>body{font:16px system-ui;max-width:1400px;margin:36px auto;padding:0 20px;color:#18352c;background:#f5f8f6}h1{font-size:28px}.table{overflow:auto}table{border-collapse:collapse;white-space:nowrap;background:white}th,td{padding:10px;border-bottom:1px solid #dce5df;text-align:right}th:first-child,td:first-child{text-align:left}pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:13px}details{padding:12px;background:white;margin:8px 0}p{max-width:900px;line-height:1.6}</style><h1>O.M.A. · STT comparison</h1><p>Independent recognition only. No LLM, TTS, desktop actions or production-setting changes. Lower CER/WER, latency and memory are better; higher critical phrase accuracy is better. RTF below 1 means faster than the recording duration.</p><p>Source types and conditions are scored separately in comparison.json. Synthetic audio cannot establish real microphone accuracy. This previously reused frozen set is a regression corpus, not an untouched holdout. Warmups are separate. CPU int8 Whisper and CPU float32 Qwen are execution configurations, not identical numerical precision. Latency excludes model loading and microphone end-of-speech detection.</p><div class="table"><table><thead><tr>'''
    page += ''.join('<th>'+v+'</th>' for v in ['Model', 'Language', 'Run', 'Coverage', 'CER', 'English WER', 'Critical', 'Noise errors', 'Median s', 'P95 s', 'RTF', 'Peak RSS GiB'])
    page += '</tr></thead><tbody>'+''.join(body)+'</tbody></table></div><h2>Errors and text differences</h2>'+failures+'</html>'
    (output/'index.html').write_text(page)


def model_identity(engine, model):
    root = Path(model)
    if engine == 'qwen':
        cache = LOCAL/'huggingface/hub'/('models--'+str(model).replace('/', '--'))
        revision = (cache/'refs/main').read_text().strip()
        root = cache/'snapshots'/revision
    files = {}
    for path in sorted(root.rglob('*')):
        if not path.is_file() or '.cache' in path.parts:
            continue
        with path.open('rb') as f:
            digest = hashlib.file_digest(f, 'sha256').hexdigest()
        files[str(path.relative_to(root))] = {'bytes': path.stat().st_size, 'sha256': digest}
    if not files:
        raise FileNotFoundError('No installed weights: '+str(root))
    return {'resolved_path': str(root.resolve()), 'files': files}


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--fixtures', type=Path, default=Path.home()/'.local/share/oma/evaluation/v1')
    p.add_argument('--output', type=Path, required=True)
    p.add_argument('--models', nargs='+', choices=MODELS, default=list(MODELS))
    p.add_argument('--split', choices=['dev', 'final'], default='dev')
    p.add_argument('--repeat', type=int, default=1)
    p.add_argument('--threads', type=int, default=8)
    p.add_argument('--python', type=Path, default=LOCAL/'venv/bin/python')
    args = p.parse_args()
    if args.repeat < 1 or args.threads < 1 or len(set(args.models)) != len(args.models):
        p.error('Positive repeat/threads and unique models required')
    manifest = json.loads((args.fixtures/'manifest.json').read_text())
    args.output.mkdir(parents=True, exist_ok=False)
    source = args.output/'source';source.mkdir()
    for name in ['stt.py', 'speech.py', 'metrics.py', 'corpus.py', 'utterances.tsv']:
        shutil.copy2(Path(__file__).parent/name, source/name)
    shutil.copy2(args.fixtures/'manifest.json', args.output/'fixtures.json')
    cases = [c for c in manifest['cases'] if c['split'] == args.split]
    data = {'split': args.split, 'threads': args.threads, 'fixture_manifest_sha256': hashlib.sha256((args.fixtures/'manifest.json').read_bytes()).hexdigest(), 'hardware': {'platform': platform.platform(), 'cpu': next((s.split(':',1)[1].strip() for s in Path('/proc/cpuinfo').read_text().splitlines() if s.startswith('model name')), None), 'cpu_affinity': sorted(os.sched_getaffinity(0))}, 'order': [], 'model_files': {}, 'runs': []}
    (args.output/'plan.json').write_text(json.dumps({'models': args.models, 'repeat': args.repeat, 'split': args.split, 'threads': args.threads}, indent=2)+'\n')
    write_report(args.output, data)
    for label in args.models:
        engine, model, languages = MODELS[label]
        try:data['model_files'][label] = model_identity(engine, model)
        except Exception as error:data['model_files'][label] = {'error': str(error)}
    for repeat in range(args.repeat):
        # Rotate process order between repetitions. Never run inference in parallel.
        order = args.models[repeat % len(args.models):] + args.models[:repeat % len(args.models)]
        for label in order:
            engine, model, languages = MODELS[label]
            directory = args.output/(label+'-'+str(repeat+1))
            command = [str(args.python), str(source/'speech.py'), 'asr', '--engine', engine, '--model', str(model), '--fixtures', str(args.fixtures.resolve()), '--output', str(directory.resolve()), '--split', args.split, '--threads', str(args.threads), '--resampler', 'scipy', '--languages', *languages]
            data['order'].append({'model': label, 'repeat': repeat, 'command': command})
            print('START '+label+' '+str(repeat+1), flush=True)
            with (args.output/(label+'-'+str(repeat+1)+'.log')).open('w') as log:
                completed = subprocess.run(command, stdout=log, stderr=subprocess.STDOUT)
            rows = [json.loads(line) for line in (directory/'results.jsonl').read_text().splitlines()] if (directory/'results.jsonl').exists() else []
            metadata = json.loads((directory/'config.json').read_text()) if (directory/'config.json').exists() else {}
            scores = {lang: score(cases, rows, lang) for lang in languages}
            failures = [r for r in rows if r.get('error') or r.get('actual') != r['expected']]
            if completed.returncode:failures.append({'error': 'Runner exited '+str(completed.returncode), 'log': label+'-'+str(repeat+1)+'.log'})
            data['runs'].append({'model': label, 'repeat': repeat, 'exit_code': completed.returncode, 'metadata': metadata, 'scores': scores, 'failures': failures})
            write_report(args.output, data)
            print('DONE '+label+' '+json.dumps({l:{k:s[k] for k in ['complete','cer','critical_accuracy','false_activations']} for l,s in scores.items()}), flush=True)
    return 0 if all(r['exit_code']==0 and all(s['complete'] for s in r['scores'].values()) for r in data['runs']) else 1

if __name__ == '__main__':
    sys.exit(main())
