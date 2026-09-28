Japanese pronunciation: [reading comparison and commands](READINGS.md).

# Local voice evaluation

For standalone bilingual model selection without running O.M.A. or desktop
actions, start with [STT and TTS comparison commands](STT-TTS.md).

This is an opt-in measurement suite. It runs real downloaded models and, for
agent/voice flows, controls the real desktop on workspace 98. Do not run CPU
benchmarks concurrently: contention invalidates latency comparisons.

Freeze a dirty checkout before measurements with
`python3 tests/voice/evaluation/freeze-source.py --copy-dependencies --output /tmp/oma-frozen`.
This includes the demo checked by `tests/run` and copies dependencies so full
manifest validation can run without symlinks. The lightweight default links
node_modules for component probes and cannot pass full plugin validation.
Keep package-lock.json and snapshot-hashes.json with the measurements.

## Corpus and scoring

`utterances.tsv` contains 50 final utterances per language and 10 separate
 development utterances. `corpus.py` adds predetermined critical phrases and
20 deterministic non-speech cases per language. Preparation uses two synthetic
speakers per language, three speeds and clean/quiet/noise conditions. Generated
speech is not evidence about human microphones or natural noisy rooms.

The manifest contains the corpus hash, audio hash, synthetic speaker, speed and
condition for every case. Frozen inputs are verified before recognition.
CER uses Unicode normalization and ignores punctuation/spacing; numeral and
spelling variations still count. Critical phrase accuracy is lexical, not a
full intent judgment. Noise false activations are separate from CER. Missing,
failed and duplicate observations cannot be silently removed.

```sh
LOCAL="$HOME/.local/share/oma/local"
"$LOCAL/venv/bin/python" tests/voice/evaluation/speech.py prepare \
  --output "$HOME/.local/share/oma/evaluation/v1"
"$LOCAL/venv/bin/python" tests/voice/evaluation/speech.py asr --engine whisper \
  --fixtures "$HOME/.local/share/oma/evaluation/v1" --split final --output /tmp/stt-baseline
"$LOCAL/comparison/asr-venv/bin/python" tests/voice/evaluation/speech.py asr --engine qwen \
  --fixtures "$HOME/.local/share/oma/evaluation/v1" --split final --output /tmp/stt-candidate
python3 tests/voice/evaluation/report.py asr /tmp/stt-baseline /tmp/stt-candidate
```

Output directories must not already exist. No downloads or paid inference are
performed. The Qwen comparison environment must already be installed.

## Synthesis

```sh
"$LOCAL/venv/bin/python" tests/voice/evaluation/speech.py tts --split final \
  --worker docs/benchmarks/local-improvement/baseline-local-speech.py --output /tmp/tts-baseline
"$LOCAL/venv/bin/python" tests/voice/evaluation/speech.py tts --split final \
  --worker runtime/local-speech.py --output /tmp/tts-candidate
python3 tests/voice/evaluation/report.py tts /tmp/tts-baseline /tmp/tts-candidate
```

Cold loading is recorded separately. Each language has 20 texts, exact
voices/speed unchanged. First PCM time and estimated first audible sample are
both saved. The latter adds leading silence to availability time; it is not a
hardware microphone measurement. Chunk readiness permits an immediate-playback
underrun simulation; naturalness and acoustic omissions still need listening.
The four-thread baseline is a source snapshot, never reconstructed from results.
`tts-threads.py` is a development-only rotating CPU-thread experiment.

## Agent operations

```sh
python3 tests/voice/evaluation/agent.py --model qwen3.5:4b \
  --split final --repeat 5 --output /tmp/oma-agent-baseline
```

Twenty bilingual tasks use real Pi tools and a disposable SQLite memory/working
folder. Desktop checks inspect actual editor contents, modal state and windows.
This bypasses recognition intentionally, and does not count speech claims as
successful actions. The O.M.A. loopback Ollama server uses installed weights;
the production default is not changed. One server schedules both models, avoiding
GPU contention from two independent resident model servers. The app language is explicitly switched.
Settings, clipboard, microphone and original workspace are restored. Unexpected
named/unsaved user documents are preserved. Test-owned failed text is archived.
Private model reasoning is not exported into the public results.

The separate agent forwards `computerUsing` through the plugin's `computerUse`
IPC and waits for it before desktop commands. Thus the floating face is hidden
during observation/input exactly as in the production pipeline. The installed
plugin must include this bridge; an older build is not a valid test environment.
`stage-plugin.py --backup /tmp/unique-manifest-backup.json` stages the current
checkout as a separate evaluation build, changes only manifest entrypoints,
reloads this plugin, and verifies the actual worker executable path. It refuses
an open panel or an existing backup. Keep the backup to restore the previous
entrypoints. This development build links the checkout's `node_modules`.

Sample runner RSS and model/device VRAM separately while the matrix runs:
`python3 tests/voice/evaluation/memory-sampler.py --pid EVALUATION_PID --output /tmp/memory.jsonl`.
The first sample starts when invoked; missing startup samples are not inferred.

For a harness probe, select `--split dev --repeat 1 --languages ja`.
A selected subset is not a full acceptance run. Individual failures remain in
`results.json`; a later run uses a different output directory.

## End to end

```sh
python3 tests/voice/run.py --providers local --languages ja en \
  --repeat 3 --keep-going --artifacts /tmp/oma-voice-final
```

Ten scenarios produce 30 observations per language. The neighbor scenario owns
an extra terminal window and verifies it survives editor close and goodbye.
English voice files always run with the app set to English. These tests use
synthetic speech through PipeWire, not a physical microphone.

## Actual recognition worker

`worker-asr.py` sends the same fixture WAV samples as 24 kHz signed PCM through
production `local-speech.py`. It uses temporary speech configuration, leaves the
installed default unchanged, and measures the actual scipy resampling and JSON
IPC. It records startup warmups separately and scores every final input.

```sh
python3 tests/voice/evaluation/worker-asr.py --stt whisper-small --split final \
  --fixtures "$HOME/.local/share/oma/evaluation/v1" --output /tmp/stt-worker-baseline
python3 tests/voice/evaluation/worker-asr.py --stt qwen3-asr-1.7b --split final \
  --fixtures "$HOME/.local/share/oma/evaluation/v1" --output /tmp/stt-worker-candidate
```

The optional candidate requires Transformers 5.13 or newer and pre-downloaded
`Qwen/Qwen3-ASR-1.7B-hf` weights in the local Hugging Face cache. It supports 30
languages; other configured languages keep Whisper. Missing models produce an
error rather than silently claiming the candidate ran. Existing installations
without `local/speech.json` retain Whisper Small. A configuration of
`{"stt":"qwen3-asr-1.7b"}` enables the candidate; this evaluation has not changed
the installed configuration. See the [official model card](https://huggingface.co/Qwen/Qwen3-ASR-1.7B-hf).

### Cancelled preview queueing

`asr-cancellation.py` uses only the separate development long-instruction WAVs.
It cancels an eight-second preview after 0.8 seconds, queues the complete input,
and records all JSON events plus final-request latency (three repetitions per
language). Compare saved worker sources under the same CPU/model conditions:

```sh
python3 tests/voice/evaluation/asr-cancellation.py \
  --worker runtime/local-speech.py --fixtures /tmp/oma-e2e-dev-fixtures-v1 \
  --output /tmp/oma-cancellation-check
```

This isolates queueing and inference. It does not measure microphone capture,
silence detection, agent operations or physical playback, and is not a substitute
for the final voice matrix. A generation cancellation can take until the current
forward pass finishes. Every final transcript must still be compared, not only
the successful or fastest observations.

An optional `asr_cpu_affinity` array in `local/speech.json` restricts recognition
to explicit CPUs available to this worker. It restores the original masks of
existing/new threads before synthesis, including after cancellation. Missing
configuration retains normal scheduling. CPU numbers are host-specific: inspect
`lscpu -e=CPU,CORE,MAXMHZ` and the current allowed mask first; do not copy the
i9-14900K measurement's numbers as a portable default. The actual-worker,
cancellation and selected-pipeline runners accept `--speech-cpus 0 2 ...` and
save this temporary selection with their results. Recheck corpus accuracy,
latency and application behavior before adopting it.

## Reproduce a selected local pipeline

After staging a compatible build and installing the selected weights, run:

```sh
python3 tests/voice/evaluation/e2e.py --model qwen3.5:4b \
  --thinking low --stt qwen3-asr-1.7b --repeat 3 \
  --output /tmp/oma-selected-pipeline
```

This wrapper saves and temporarily selects `local/agent.json` and
`local/speech.json`, records the environment, runs both app languages, and
restores the previous selections even on failure. For Qwen3.5, `low` enables
thinking; the model supports on/off, not a bounded low-effort budget. The app
must report the requested model before a scenario runs.

`local/agent.json` is an optional O.M.A.-owned selection, for example
`{"model":"qwen3.5:4b","thinkingLevel":"low"}`. It never changes the user's
normal Pi provider or credentials. Without it, the existing 4B/off default
is retained. The optional speech selection is
`{"stt":"qwen3-asr-1.7b"}` in `local/speech.json`; unsupported Qwen languages
continue to use Whisper. Weights and compatible dependencies must already
be installed; these test commands do not download them.

For a complete baseline matrix that is expected to lose disposable drafts,
`agent.py --continue-after-fixture-loss` permits moving to the next isolated
case after recording that exact critical failure. It never continues after
an unrelated-window error. Such losses remain critical failures in the report;
they cannot pass acceptance. By default all critical errors stop the run.

Optional Qwen ASR installation/selection is reproducible through
`scripts/setup-local --stt qwen3-asr-1.7b`. This downloads the pinned Qwen model
revision and installs Transformers 5.17.0. It preserves an existing speech choice
when no option is given. `--stt whisper-small` selects the smaller recognizer.
Qwen 1.7B used about 12 GiB worker RSS on this machine; it is not a low-memory
replacement. Run setup before collecting a paired comparison, never midway
through a benchmark. The evaluation wrappers themselves do not install packages.

### Read-only editor inspection (optional evaluation instrumentation)

Clipboard verification can fail when Qt activation lags behind compositor focus.
For repeatable native-buffer checks, stage a copied OmaText build while both apps
are closed, before starting either baseline or candidate:

```sh
python3 tests/voice/evaluation/stage-editor-inspection.py --backup /tmp/omatext-original-manifest.json
export OMA_EVALUATION_EDITOR_INSPECTION=1
```

This adds only `inspectEvaluationDocument`, returning the actual document buffer.
It does not insert text, dismiss dialogs, change file IO, or give the model an
expected answer. GUI actions still use the real application. The environment
snapshot records the inspection method, entrypoint and EditorBase hash. Use the
same method for both sides of a comparison. Earlier clipboard failures remain
failures; they are not retroactively rescored. Restore the backed-up manifest
with both applications closed, then disable/rescan/enable OmaText.

Local sampling comparison flags are `--temperature`, `--top-p`, and
`--presence-penalty` for `agent.py` and `e2e.py`. Omitted values retain existing
behavior; explicit overrides and all failures are saved in the run configuration.

### Playback capture, readback and blind listening

After producing the paired `/tmp/tts-baseline` and `/tmp/tts-candidate` WAVs:

```sh
node tests/voice/evaluation/playback.mjs \
  docs/benchmarks/local-improvement/baseline-local-speech.py \
  runtime/local-speech.py /tmp/tts-playback
"$LOCAL/venv/bin/python" tests/voice/evaluation/capture-check.py \
  /tmp/tts-playback /tmp/tts-baseline /tmp/tts-candidate --output /tmp/tts-capture-check.jsonl
"$LOCAL/venv/bin/python" tests/voice/evaluation/readback.py \
  /tmp/tts-baseline /tmp/tts-candidate --output /tmp/tts-readback.jsonl
python3 tests/voice/evaluation/preview.py \
  /tmp/tts-baseline /tmp/tts-candidate --output /tmp/tts-listening
python3 -m http.server 35673 --bind 127.0.0.1 --directory /tmp/tts-listening
```

The readback command requires the installed Whisper Turbo comparison weights.
Playback uses a dedicated null sink and records its monitor; it does not route
samples to the physical speakers. Open the listening page separately for human
ratings. Generation RTF is reported separately by `report.py tts`; trimming
silence can reduce output duration, so a faster onset alone does not imply a
lower generation-time/audio-duration ratio.

### Retained operation baseline source

The original operation implementation is retained even though the working tree
already contained uncommitted work when this goal began:

```sh
mkdir /tmp/oma-operation-baseline-source
tar -xzf docs/benchmarks/local-improvement/baseline-agent-source.tar.gz \
  -C /tmp/oma-operation-baseline-source
ln -s "$PWD/node_modules" /tmp/oma-operation-baseline-source/node_modules
python3 tests/voice/evaluation/agent.py --model qwen3.5:4b --thinking off \
  --agent-module /tmp/oma-operation-baseline-source/runtime/pi.mjs \
  --split final --repeat 5 --continue-after-fixture-loss \
  --output /tmp/oma-operation-baseline-final
```

Use the same installed UI and editor instrumentation for baseline and candidate.
The archive has source hashes beside it. `evaluation-package-lock.json` records
the Node dependencies shared by the measurements; it is evidence, not a request
to overwrite the project's current lockfile. Baseline thinking is off and local
sampling is the original temperature 0.2 with the server's remaining defaults.

Summarize the memory log with
`python3 tests/voice/evaluation/memory-report.py /tmp/memory.jsonl`.
RAM RSS, server-estimated model allocations and whole-device GPU residency are
kept separate. Missing samples and unsampled startup cannot be reconstructed.

For a component comparison using a different model, keep the UI's greeting
prelude on that same model so it does not load a competing default model:

```sh
OMA_EVALUATION_EDITOR_INSPECTION=1 python3 tests/voice/evaluation/selected-agent.py \
  --source /tmp/frozen-candidate --model qwen3.5:9b --thinking low \
  --temperature 0.6 --top-p 0.95 --presence-penalty 0 \
  --split dev --repeat 1 --output /tmp/oma-selected-agent-dev
```

This requires a staged UI supporting `local/agent.json`; the actual app model
is asserted before trials. The wrapper restores the previous selection even
when the child matrix fails. Use `--harness /tmp/frozen-harness` when evaluating
an older source snapshot that does not include the measurement scripts. Pull
all required weights before running comparisons, never during a timed matrix.

For a separate visual diagnostic run, set
`OMA_EVALUATION_CAPTURE_SCREENSHOTS=1`. The component harness saves the exact
PNG frames returned by the real desktop tool, with frame metadata, below each
case's `screenshots/` directory. It does not modify the image or provide expected
coordinates to the agent. The setting is recorded in `config.json`; keep these
diagnostic runs separate from latency comparisons because image writes add work.
Screenshots remain local and may include the desktop bar; inspect before sharing.

A baseline expected to issue unsafe target selections can additionally use
`--continue-after-blocked-target`. This applies only to a close that the harness
refused **before execution** because its exact target was outside the evaluation
workspace. It remains a critical failed trial. Actual unrelated-window loss,
unknown critical errors, and workspace changes still stop the run. Candidate
acceptance never permits critical failures, regardless of continuation flags.

If infrastructure stops a matrix between trials, keep its original directory.
Run only the missing repetitions with unchanged source, harness and conditions,
then combine into a new directory (never overwrite a failed trial):

```sh
python3 tests/voice/evaluation/complete-agent-run.py ORIGINAL SUPPLEMENT \
  --repeat-offset 4 --output COMBINED
python3 tests/voice/evaluation/operations-report.py agent COMBINED
```

The combining command rejects changed source/harness hashes and settings,
already attempted trials, duplicate results and unknown trial keys. It retains
both original runs and the explicit repeat-index mapping. This is completion
of never-run observations, not replacement of failures.

### Separate development voice fixtures

Use different development utterances and synthetic speakers without touching the
frozen final WAVs:

```sh
"$HOME/.local/share/oma/local/venv/bin/python" \
  tests/voice/evaluation/e2e-fixtures.py --output /tmp/oma-dev-voice-fixtures
OMA_EVALUATION_EDITOR_INSPECTION=1 python3 tests/voice/evaluation/e2e.py \
  --model qwen3.5:9b --thinking low --stt qwen3-asr-1.7b \
  --temperature .2 --top-p 1 --presence-penalty 1.5 \
  --split dev --fixtures /tmp/oma-dev-voice-fixtures --repeat 1 \
  --cases farewell document empty-with-neighbor --output /tmp/oma-dev-voice-run
```

The fixture manifest records expected document text, speaker, sample hashes and
split. The wrapper checks the split and records installed source/harness hashes
before running. `operations-report.py e2e` rejects development runs as acceptance
evidence. English scenarios explicitly select English in app settings. These are
synthetic PipeWire inputs, not recordings of a human voice.

## Reproduce the v26/v27 candidate comparison

The production-path recognition runner accepts an explicit archived worker so
baseline and candidate can use the same harness and frozen audio. Use new output
paths; do not overwrite earlier measurements.

```sh
python3 tests/voice/evaluation/worker-asr.py --stt whisper-small --split final \
  --worker docs/benchmarks/local-improvement/asr-worker-final-v26-baseline/worker.py \
  --fixtures "$HOME/.local/share/oma/evaluation/v1" --output /tmp/oma-asr-new-baseline
python3 tests/voice/evaluation/worker-asr.py --stt qwen3-asr-1.7b --split final \
  --worker docs/benchmarks/local-improvement/asr-worker-final-v26-candidate/worker.py \
  --fixtures "$HOME/.local/share/oma/evaluation/v1" --output /tmp/oma-asr-new-candidate
python3 tests/voice/evaluation/report.py asr /tmp/oma-asr-new-baseline /tmp/oma-asr-new-candidate
```

Freeze the checkout before a desktop matrix, then stage that frozen source with
`stage-plugin.py` as described above. The selected-agent wrapper restores the
previous model/sampling selection even if the matrix fails.

```sh
python3 tests/voice/evaluation/freeze-source.py --output /tmp/oma-new-frozen-source
python3 /tmp/oma-new-frozen-source/tests/voice/evaluation/stage-plugin.py \
  --backup /tmp/oma-new-original-manifest.json
OMA_EVALUATION_EDITOR_INSPECTION=1 \
python3 /tmp/oma-new-frozen-source/tests/voice/evaluation/selected-agent.py \
  --source /tmp/oma-new-frozen-source --model qwen3.5:4b --thinking low \
  --temperature .2 --top-p 1 --presence-penalty 0 \
  --split final --repeat 5 --output /tmp/oma-new-agent-final
```

The native editor-inspection option requires the read-only OmaText evaluation
build (`stage-editor-inspection.py`) and its saved original manifest. It observes
the real document; it does not substitute fixture contents. Do not enable the
option with a standard editor build that lacks the inspection IPC.

For supplementary important-word accuracy and individual missing-word groups:

```sh
python3 tests/voice/evaluation/asr-keywords.py /tmp/oma-asr-new-baseline
python3 tests/voice/evaluation/asr-keywords.py /tmp/oma-asr-new-candidate
```

This uses the unchanged frozen lexical groups and does not replace the stricter
whole-phrase acceptance criterion. Alternative spellings in one group count once.
Missing or failed observations prevent a numeric accuracy result.

`playback.mjs` also accepts baseline and candidate `runtime/audio.mjs` paths as
its fourth and fifth arguments, so frozen playback implementations can be
compared along with the workers. It records both module hashes, generation
milliseconds and generation real-time factor separately from audible onset.

`node tests/voice/evaluation/audio-path-lifecycle.mjs` is an opt-in silent live
PipeWire stress check: 12 playback/recording/echo-path replacements, followed by
owned-process and node removal assertions. It creates temporary virtual devices,
preserves default devices, and removes its modules in cleanup. Save its JSON
output with the application-level voice measurements; it does not replace them.

`python3 tests/voice/evaluation/playback-report.py /tmp/tts-playback` reports the
paired audible-onset timing gate, generation time and real-time factor. Missing,
duplicate, errored or different-text observations cannot pass; neither can a
regression in p95 or maximum onset. Waveform continuity and human listening remain
separate requirements, even when this timing gate passes.

`python3 tests/voice/evaluation/window-restore.py --repeat 5` is an opt-in real
window lifecycle check, without model inference. It opens O.M.A.'s settings and
a disposable terminal on empty workspace 98, simulates desktop observation,
closes that terminal, and checks that the reappearing O.M.A. window floats.
The original workspace and view mode are restored. This is layout evidence,
not an agent-operation or voice acceptance score.

### Private filesystem for real voice runs

Workspace 98 isolates window placement, not file tools. Real voice runs must now
stage the worker with a fresh private profile and the read-only filesystem wrapper:

```sh
python3 tests/voice/evaluation/worker-sandbox.py --prepare \
  --source /tmp/oma-frozen --profile /tmp/oma-private-profile \
  --microphone YOUR_ORIGINAL_SOURCE
python3 tests/voice/evaluation/stage-plugin.py --source /tmp/oma-frozen \
  --sandbox-profile /tmp/oma-private-profile --backup /tmp/unique-manifest-backup.json
OMA_DATA_DIR=/tmp/oma-private-profile OMA_EVALUATION_EDITOR_INSPECTION=1 \
  python3 tests/voice/evaluation/e2e.py --model qwen3.5:4b --thinking low \
  --temperature .2 --top-p 1 --presence-penalty 0 --stt qwen3-asr-1.7b \
  --fixtures /tmp/oma-voice-fixtures --split final --repeat 3 \
  --languages ja en --output /tmp/oma-private-voice-results
```

Use an equally fresh protected profile for the retained baseline, with its original
worker source and baseline settings. The source archive records the evaluation
Service command, wrapper and profile metadata. The wrapper mounts the host
read-only, reuses model weights read-only, and permits writes only to the fresh
profile/workspace, private temporary storage and required device interfaces.
A test verifies actual rejection of a protected-file write. OMA_DATA_DIR also
selects the harness transcript database; ordinary user memories are not copied.
Desktop IPC remains shared with the real compositor/apps, so this is not a
hostile-code security boundary. Unrelated-window and unsaved-document guards
remain mandatory. Restore ordinary manifest entrypoints after the run; the user's
ordinary settings database was not changed by these isolated workers.
