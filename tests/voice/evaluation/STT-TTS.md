# Standalone STT and TTS comparison

These commands do not start O.M.A., an LLM, desktop actions or a microphone.
They leave installed application settings unchanged. Each call explicitly selects
Japanese or English in the model; no application-language setting is involved.
Run one benchmark at a time. All weights must already be installed; inference
is offline. Output directories must be new.

## STT

```sh
python3 tests/voice/evaluation/stt.py --split dev --output /tmp/oma-stt-dev
python3 tests/voice/evaluation/stt.py --split final --output /tmp/oma-stt-final
```

The defaults compare Whisper Small, Whisper Large-v3 Turbo, Qwen3-ASR 0.6B,
Qwen3-ASR 1.7B, and Japanese-only Kotoba-Whisper v2. Use `--models` to select
candidates, `--threads 8` to set the CPU budget, and `--repeat 3` for repeated
measurements. Model order rotates between repetitions. The default Python is
`~/.local/share/oma/local/venv/bin/python`; `--python` can select another prepared
environment. The model path mapping is at the top of `stt.py`.

The frozen input manifest defaults to `~/.local/share/oma/evaluation/v1` and can
be selected with `--fixtures`. Preparation is described in [README.md](README.md).
Final data contains 50 utterances and 20 noise/silence clips per language; the
separate development data has ten utterances per language. These are synthetic
Kokoro voices and generated noise, not microphone recordings. The existing final
set has been reused in earlier work, so it is a regression corpus, not an untouched
holdout. Do not tune individual expected transcripts or exclude failed cases.

Outputs:

- `index.html`: readable comparison and all text differences/errors.
- `comparison.json`: CER, English WER, critical phrases, keywords, exact strings,
  noise errors, median/P95/max latency, RTF, source/condition breakdowns and memory.
- Each model directory: raw observations, model settings, package versions,
  loading/warmup times, language and errors.
- `source/`, `fixtures.json`, `plan.json`: runner snapshot, audio hashes and plan.
  Weight file hashes and resolved paths are in `comparison.json`.

Lower CER/WER is better; higher critical accuracy is better. Literal exact match
also exposes punctuation/spacing changes that normalized CER ignores. Japanese
uses CER rather than a tokenizer-dependent word score. Noise errors are not
averaged into speech accuracy. Incomplete or failed results do not receive a
valid accuracy score. Missing models remain failed runs; they are not downloaded.

This measures CPU configurations: Whisper int8/beam 5 and Qwen float32/greedy,
eight threads by default. Both use the same resampling and Silero VAD defaults.
It is a comparison of practical inference configurations, not equal-precision
model architecture research. GPU performance needs a separate experiment.
Recognition timing starts with file preprocessing and excludes cold loading,
microphone capture, turn detection and subsequent agent reasoning. Memory is
peak process RSS, including runtime and VAD, not just the weights.

## TTS

```sh
LOCAL="$HOME/.local/share/oma/local"
"$LOCAL/venv/bin/python" tests/voice/evaluation/tts-models.py \
  --engine kokoro --split final --output /tmp/oma-tts-kokoro
"$LOCAL/comparison/tts-venv/bin/python" tests/voice/evaluation/tts-models.py \
  --engine qwen --split final --output /tmp/oma-tts-qwen
"$LOCAL/venv/bin/python" tests/voice/evaluation/readback.py \
  /tmp/oma-tts-kokoro /tmp/oma-tts-qwen --output /tmp/oma-tts-readback.jsonl
python3 tests/voice/evaluation/tts-report.py /tmp/oma-tts-kokoro /tmp/oma-tts-qwen \
  --readback /tmp/oma-tts-readback.jsonl --output /tmp/oma-tts-comparison.json
python3 tests/voice/evaluation/preview.py /tmp/oma-tts-kokoro /tmp/oma-tts-qwen \
  --baseline-label 'Kokoro 82M' --candidate-label 'Qwen3-TTS 0.6B' \
  --description 'Different native preset voices. Compare intelligibility and preference separately; no effects.' \
  --output /tmp/oma-tts-listening
```

Each model generates the same 20 texts per language from the frozen corpus.
A quick environment probe uses `--split dev --limit 1`; final runs cannot use
`--limit`. Both run on CPU with eight threads. The Qwen environment is separate
to preserve O.M.A.'s installed dependencies. Voice IDs, runtime, weight hashes,
loading, warmup and all sample timings are saved. No effects are added.
Qwen uses its cached model's default sampling controls with seed 0 and a 2,048
token output ceiling. Earlier greedy development failures remain separate.

`first_sound_seconds` is **estimated earliest digital sound** from API output
availability plus leading silence; no physical speaker or PipeWire timing is
measured here. Kokoro yields chunks; this Qwen `generate_custom_voice` API returns
a whole waveform. Its number is not a verdict on Qwen's possible optimized
streaming or GPU implementations. Chunk readiness allows simulated buffer-gap
measurement; it does not prove acoustic continuity. Saved samples let humans
check pauses, repetition, clipping, missing words and pronunciation.

ASR readback is only an omission/intelligibility proxy and can itself be wrong.
Naturalness remains human-unrated until someone listens. The blind page hides
model labels until Reveal, provides Japanese/English filtering, and exports
ratings keyed to the exact audio dataset. Different preset voices and loudness
can affect preference. Do not call this a matched-speaker quality ranking.
