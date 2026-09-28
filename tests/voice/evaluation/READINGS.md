# Japanese reading comparison

`readings-ja.json` contains 32 assistant-authored sentences, intended kana readings,
accepted alternatives, and target substrings, fixed before synthesis. Categories
cover context-dependent kanji, numbers/counters/dates, desktop commands and places.
The four separate controls contain two intended correct kana inputs and two
intentional substitutions. Controls never contribute to the 32-case score.
Some context-dependent expressions can admit another interpretation (for example,
市場 can be いちば or しじょう). Thus target matching measures the **intended reading**,
not proof that every mismatch is a linguistically invalid pronunciation.

Kokoro Kumo and Qwen3-TTS 0.6B Ryan / Uncle Fu use the same texts. All voices are
male; Qwen presets are not native Japanese. Seed 0, CPU, eight threads. TTS gets
only the original text, never the references. References are not produced by the
models being tested. Accents, naturalness and preference are outside this score.

Both standard speed and 1.20 are retained. Kokoro uses native synthesis speed.
Qwen 0.6B has no numeric native speed control; `ffmpeg atempo=1.2` creates the
accelerated sample, preserving pitch. This differs from the browser's playback
algorithm used on the earlier voice-selection page. Timings are diagnostics,
not a latency benchmark; jobs may overlap during this accuracy-only experiment.

The recognizer directly emits kana from audio. It receives no expected text,
reading prompt or target list. Recognized kanji are rejected, not re-read using
a dictionary. Kana CER is an ASR proxy and includes recognizer errors, long-vowel
spelling differences and small-kana errors. Both strict kana matching and phonetic substring matching are retained. Phonetic
matching converts only kana to phonemes with pyopenjtalk, merges common e+i/e+e
and o+u/o+o spellings, and normalizes devoiced vowels. It retains vowel length,
consonants and small-kana distinctions. This is not forced alignment. A matched target can coexist with another error
elsewhere in the utterance. Controls test limited cases, not universal reliability.
Human listening remains separately pending.

```sh
LOCAL="$HOME/.local/share/oma/local"
"$LOCAL/venv/bin/python" tests/voice/evaluation/reading.py synthesize \
  --engine kokoro --output /tmp/readings-kokoro
"$LOCAL/comparison/tts-venv/bin/python" tests/voice/evaluation/reading.py synthesize \
  --engine qwen --output /tmp/readings-qwen
"$LOCAL/venv/bin/python" tests/voice/evaluation/reading.py recognize \
  --input /tmp/readings-kokoro /tmp/readings-qwen --output /tmp/readings-asr
"$LOCAL/venv/bin/python" tests/voice/evaluation/reading_report.py --readback /tmp/readings-asr \
  --audio /tmp/readings-kokoro /tmp/readings-qwen --output /tmp/readings-report
python3 tests/reading_benchmark_test.py
```

Use new output directories. Failures and missing cases remain in the results and
prevent a complete score. Models, weight hashes, environment, corpus hash, raw
WAV hashes and transcripts are retained. No production settings are changed.
Weights must already be cached; all inference runs offline.

Sources: [slplab kana recognizer](https://huggingface.co/slplab/wav2vec2-xls-r-300m-japanese-hiragana),
[sakasegawa kana recognizer](https://huggingface.co/sakasegawa/japanese-wav2vec2-large-hiragana-ctc).

Run `recognize --recognizer sakasegawa` in another new output directory to
cross-check with the second kana model. The standard slplab recognizer is the
default. The second loader reads the official checkpoint with `weights_only=True`,
strict-loads the encoder and kana head, and greedily decodes the published kana
vocabulary; it does not execute remote model code. Cache its checkpoint plus
reazon-research/japanese-wav2vec2-large config and preprocessor files first.
The unused auxiliary phoneme head is not part of inference.

Phonetic scoring requires pyopenjtalk and its OpenJTalk dictionary. Run the full
scorer unit tests with the local speech venv to include that optional dependency.
Both recognition models can fail on correctly supplied kana; control failures
must accompany any comparison, and ASR consensus is still not a human verdict.
