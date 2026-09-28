#!/usr/bin/env python3
"""Opt-in recognition regression using installed local models; no audio playback."""
import argparse
import importlib.util
import json
from pathlib import Path
import wave

import numpy as np

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--data', type=Path, default=Path.home()/'.local/share/oma/local')
parser.add_argument('--fixtures', type=Path, default=Path('/tmp/oma-voice-fixtures'))
args = parser.parse_args()
assert (args.data/'whisper/model.bin').exists(), 'Install local speech models first'
spec = importlib.util.spec_from_file_location('local_speech', Path(__file__).parents[1]/'runtime/local-speech.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
engine = module.Engines(args.data)
noise = np.random.default_rng(42).integers(-50, 51, 24000*3, dtype=np.int16).astype('<i2').tobytes()
for language in ('ja', 'en'):
    for label, pcm in [('silence', bytes(24000*3*2)), ('quiet noise', noise)]:
        text = engine.transcribe(pcm, language)
        assert not text, f'{language}: {label} produced text: {text!r}'
        print(f'PASS {language}: {label} stays empty', flush=True)
    root = args.fixtures/language
    phrase = json.loads((root/'manifest.json').read_text())['phrases']['close']
    with wave.open(str(root/phrase['file'])) as recording:
        assert (recording.getnchannels(), recording.getsampwidth(), recording.getframerate()) == (1, 2, 24000)
        pcm = recording.readframes(recording.getnframes())
    text = engine.transcribe(pcm, language)
    assert 'omatext' in text.lower().replace(' ', ''), f'{language}: application name corrupted: {text!r}'
    print(f'PASS {language}: OmaText retained in close request', flush=True)
