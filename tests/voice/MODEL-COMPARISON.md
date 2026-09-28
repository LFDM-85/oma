# Local Japanese model comparison

These opt-in scripts measure components independently. They do not change the
installed provider, models, language or microphone, and do not execute LLM tool
calls. Download models into a comparison directory before running. Keep model
installation dependencies in separate environments, not the production venv.

The English desktop harness in `run.py` explicitly switches the app response
language to `en`, waits for it, and asserts it before opening the conversation.

## Recognition

`compare-asr.py --models label=/path/to/ct2-model ...` uses the same 13 cached
Japanese voice fixtures plus deterministic silence and quiet noise. Whisper
variants run CPU/int8, four threads, beam 5, with the same application context.
`compare-qwen-asr.py` uses native Transformers Qwen3-ASR 0.6B, CPU/float32,
four threads, forced Japanese and the same context. Its raw silence behavior
is tested without Whisper's built-in VAD, so compare that limitation explicitly.
Pass `--vad` to also evaluate the same Silero defaults ahead of Qwen. Keep the
raw and VAD-assisted results separate.

Character error rate removes punctuation/whitespace, normalizes width/case and
the spelling `OmaText`. It still counts alternate numeral spellings and kanji
choices; inspect the actual transcripts as well. These synthetic recordings are
one speaker in a clean environment, not a human/noisy-room benchmark.

## Agent

`node tests/voice/compare-models.mjs qwen3.5:4b qwen3.5:9b gemma4:e2b`
starts an owned comparison server on port 11437 (and refuses an occupied port).
It uses the actual O.M.A. profile/tool schema, Japanese response language,
fresh memory, temperature 0.2 and 2048 output tokens. Each model runs eight
cases twice, without retrying failed cases. Tool names/arguments and final
text are checked; private reasoning is not exported. Closing tests only the
required first `list_windows` call, not the complete desktop workflow. Live
voice/window tests are still required before adopting a model. First requests
include cold loading; report those separately from ordinary inference timing.

## Speech

`compare-tts.py --engine kokoro --output /path/to/audio/kokoro`
and `compare-tts.py --engine qwen --device cpu --output /path/to/audio/qwen`
generate the same three Japanese texts without effects. Qwen uses the supplied
Japanese preset Ono_Anna, not a cloned speaker. Kokoro uses O.M.A.'s jm_kumo.
Different speakers mean this is not a controlled timbre comparison.

The first sample can include lazy loading/JIT. `first_audio_seconds` for the
Qwen Python API is full-clip availability, not a claim about streaming support
or minimum achievable latency. RTF is generation seconds divided by audio
duration. Numerical timing and ASR round trips do not establish naturalness;
listen to the exported WAVs before making a subjective quality choice.

`OMA_COMPARE_REASONING=low node tests/voice/compare-models.mjs qwen3.5:9b`
evaluates reasoning with a 4096-token output budget instead of the default 2048.
Keep that configuration's results separate from reasoning-off runs.

Recorded results: [Japanese report](../../docs/LOCAL-MODEL-COMPARISON-JA.md).
