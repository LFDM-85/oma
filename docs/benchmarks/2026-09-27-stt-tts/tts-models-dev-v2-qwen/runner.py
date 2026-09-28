#!/usr/bin/env python3
"""Bilingual TTS-only measurement using installed weights; no playback or app mutation."""
import argparse
import hashlib
import importlib.metadata
import json
import os
from pathlib import Path
import resource
import sys
import time
from corpus import cases, corpus_hash
from metrics import distribution, playback_gaps

LOCAL = Path.home()/'.local/share/oma/local'

def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--engine', choices=['kokoro', 'qwen'], required=True)
    p.add_argument('--output', type=Path, required=True)
    p.add_argument('--split', choices=['dev', 'final'], default='dev')
    p.add_argument('--threads', type=int, default=8)
    p.add_argument('--limit', type=int, help='Development smoke test only')
    a = p.parse_args()
    if a.threads < 1:p.error('--threads must be positive')
    if a.limit is not None and (a.split != 'dev' or a.limit < 1):p.error('--limit is only for positive development subsets')
    a.output.mkdir(parents=True, exist_ok=False)
    os.environ.update(HF_HOME=str(LOCAL/'huggingface'), HF_HUB_OFFLINE='1', TRANSFORMERS_OFFLINE='1')
    import numpy as np
    import soundfile as sf
    import torch
    torch.set_num_threads(a.threads)
    torch.manual_seed(0)
    np.random.seed(0)
    model_id = 'hexgrad/Kokoro-82M' if a.engine == 'kokoro' else 'Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice'
    meta = {'engine': a.engine, 'model': model_id, 'device': 'cpu', 'dtype': 'float32', 'threads': a.threads, 'seed': 0,
            'voices': {'ja': 'jm_kumo', 'en': 'am_michael'} if a.engine == 'kokoro' else {'ja': 'Ono_Anna', 'en': 'Ryan'},
            'split': a.split, 'corpus_sha256': corpus_hash(), 'cpu_affinity': sorted(os.sched_getaffinity(0)),
            'timing': 'API PCM availability plus leading silence; no physical playback. Qwen custom_voice returns a complete waveform; streaming performance is not measured.',
            'versions': {name: importlib.metadata.version(name) for name in ['torch', 'numpy', 'soundfile', 'transformers', 'kokoro' if a.engine == 'kokoro' else 'qwen-tts']},
            'source_sha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest()}
    meta['limit'] = a.limit
    meta['generation'] = {'speed': 1, 'trim_exact_zero_padding': True} if a.engine == 'kokoro' else {'do_sample': False, 'max_new_tokens': 2048, 'attention': 'sdpa'}
    from stt import model_identity
    meta['model_files'] = model_identity('qwen', model_id)
    (a.output/'runner.py').write_bytes(Path(__file__).read_bytes())
    def save():
        (a.output/'config.json').write_text(json.dumps(meta, ensure_ascii=False, indent=2)+'\n')
    save()
    start = time.monotonic()
    if a.engine == 'kokoro':
        sys.path.insert(0, str(Path(__file__).parent))
        from speech import load_worker
        worker_path = Path(__file__).resolve().parents[3]/'runtime/local-speech.py'
        worker = load_worker(worker_path)
        worker.speech_thread_count = lambda: a.threads
        (a.output/'worker.py').write_bytes(worker_path.read_bytes())
        engine = worker.Engines(LOCAL)
        def generate(text, lang):
            for pcm in engine.speak(text, lang):
                yield np.frombuffer(pcm, dtype='<i2').astype(np.float32)/32768, 24000
    else:
        from qwen_tts import Qwen3TTSModel
        engine = Qwen3TTSModel.from_pretrained(meta['model_files']['resolved_path'], device_map='cpu', dtype=torch.float32, attn_implementation='sdpa', local_files_only=True)
        meta['versions']['qwen-tts'] = importlib.metadata.version('qwen-tts')
        def generate(text, lang):
            wavs, rate = engine.generate_custom_voice(text=text, language={'ja': 'Japanese', 'en': 'English'}[lang], speaker=meta['voices'][lang], do_sample=False, max_new_tokens=2048)
            yield np.asarray(wavs[0]), rate
    meta['construct_seconds'] = time.monotonic()-start
    meta['warmups'] = []
    rows = []
    for lang in ['ja', 'en']:
        start = time.monotonic()
        list(generate('準備中です。' if lang == 'ja' else 'Getting ready.', lang))
        meta['warmups'].append({'language': lang, 'seconds': time.monotonic()-start})
        save()
        for case in cases(lang, a.split)[:a.limit or 20]:
            row = {'id': case['id'], 'language': lang, 'text': case['text']}
            start = time.monotonic();chunks = [];arrays = [];first_sound = None
            try:
                for audio, rate in generate(case['text'], lang):
                    ready = time.monotonic()-start
                    voiced = np.flatnonzero(np.abs(audio) > 100/32768)
                    if first_sound is None and len(voiced):first_sound = ready+float(voiced[0])/rate
                    chunks.append({'ready': ready, 'duration': len(audio)/rate})
                    arrays.append(audio)
                elapsed = time.monotonic()-start
                data = np.concatenate(arrays) if arrays else np.zeros(0)
                if not len(data) or first_sound is None:raise ValueError('No audible speech')
                path = a.output/(case['id']+'.wav');sf.write(path, data, rate, subtype='PCM_16')
                row.update(seconds=elapsed, first_audio_seconds=chunks[0]['ready'], first_sound_seconds=first_sound,
                           duration=len(data)/rate, rtf=elapsed/(len(data)/rate), chunks=chunks,
                           simulated_gap_seconds=playback_gaps(chunks), frames=len(data), sample_rate=rate,
                           sha256=hashlib.sha256(path.read_bytes()).hexdigest())
            except Exception as error:row.update(error=str(error), seconds=time.monotonic()-start)
            rows.append(row)
            with (a.output/'results.jsonl').open('a') as f:f.write(json.dumps(row, ensure_ascii=False)+'\n')
            print(json.dumps(row, ensure_ascii=False), flush=True)
    meta['peak_rss_kib'] = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    save()
    summary = {}
    for lang in ['ja', 'en']:
        selected = [r for r in rows if r['language'] == lang]
        summary[lang] = {'expected': len(cases(lang, a.split)[:a.limit or 20]), 'observed': len(selected), 'errors': [r for r in selected if r.get('error')],
                         'first_sound_seconds': distribution([r['first_sound_seconds'] for r in selected if not r.get('error')]),
                         'rtf': distribution([r['rtf'] for r in selected if not r.get('error')]),
                         'simulated_gap_seconds': sum(r.get('simulated_gap_seconds', 0) for r in selected), 'listening': 'pending', 'omissions': 'ASR readback and human listening required'}
    (a.output/'summary.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2)+'\n')
    return int(any(r.get('error') for r in rows))

if __name__ == '__main__':
    sys.exit(main())
