# Local voice improvement evaluation

The overall goal remains incomplete. Component measurements are below; final operation and end-to-end gates and human listening remain outstanding.

The goal requested on 2026-09-26 covers Japanese and English recognition,
agent operations, speech and end-to-end desktop conversations. The session goal
controller still holds an older blocked goal; this document tracks the new
work without marking that older goal complete.

## Fixed acceptance criteria

- STT: each language 50 final speech inputs and 20 non-speech inputs, plus 10
  separate development inputs. At least 20% relative CER reduction versus the
  baseline, without lower critical phrase accuracy or worse false activations.
- Agent: 20 actual operation tasks per language, five repetitions each; >=90%
  success separately per language; zero consequential wrong-window/data-loss
  operations. First-tool-only model probes are not qualifying evidence.
- TTS: 20 final texts per language; >=20% median first-sound improvement;
  no regression in tail latency, missing speech or underruns. Human listening
  remains separate from generated PCM and ASR checks.
- End to end: 10 scenarios x 3 repeats per language, >=27/30 separately; empty
  and occupied test workspaces; actual app language explicitly selected.
- Preserve all failures, incomplete and not-run observations. No retries erase
  failures. Keep development and final results separate.

## Baseline

`baseline-local-speech.py` is the unchanged source snapshot before this work.
`baseline-sha256.txt` records the original worker/agent/harness hashes. The model
weights and earlier model provenance are under the adjacent
`2026-09-26-ja-models` directory. No production model setting has been changed.

The new fixed corpus is `tests/voice/evaluation/utterances.tsv`. Its 50 final
utterances in each language are distinct from its 10 development utterances.
Audio preparation uses two Kokoro speakers, three speaking rates, clean/quiet/
18 dB additive-noise conditions, with deterministic noise and file checksums.
These are synthetic fixtures, not recordings of people or a real noisy room.
CER does not erase numeral/spelling errors by substituting expected words.
Critical phrase matching is a lexical check, not a complete semantic judge.

TTS timing currently records PCM availability and leading silence, simulating
immediate playback. It must not be reported as measured physical speaker output.

## Progress (2026-09-26)

- Frozen recognition baseline: Japanese CER 53/751 (7.06%), critical phrases
  20/23; English CER 122/1433 (8.51%), critical phrases 23/23; non-speech false
  activations 0/20 in both languages.
- Qwen 0.6B + VAD, greedy: Japanese CER 24/751 (3.20%), but critical phrases
  19/23: **fails the gate**. English CER 1/1433 (0.070%), critical phrases 23/23,
  zero false activations: passes this synthetic recognition gate only.
- Qwen beam 3 did not fix Japanese critical phrases (19/23) and approximately
  doubled recognition latency. Not selected.
- TTS CPU-thread sweep: 4, 2, 1 and 8 threads, rotated three times on development
  texts. Eight threads were faster. Runtime now caps the budget at eight and
  available CPUs; exact-zero leading padding is shortened to 20 ms, retaining
  every nonzero sample and all trailing audio.
- Fixed TTS generation proxy: Japanese median first sound 1.055 -> 0.812 s
  (23.0%); English 1.080 -> 0.802 s (25.8%). P95 improved; simulated underruns
  zero. Real PipeWire capture and human listening remain separate checks.
- Agent pilot on the existing 4B model: mini mode passed; the math reply was
  incorrect (1+1 answered 0). The blank-document pilot exposed a harness bug:
  copying an empty editor leaves old clipboard data. Native document length is
  now used for the empty case; a regression test reproduces and covers it.
  These three pilot cases are not a full acceptance run.
- The end-to-end harness now has ten scenarios and explicit independent
  repetitions. The new neighbor fixture must survive document close/goodbye.
  The full 30-per-language acceptance matrix has not run yet.

Listening artifact: `~/.local/share/oma/evaluation/listening-v1/index.html`.
All 80 embedded audio elements loaded metadata successfully in Chrome.
No human listening rating has been assigned by the agent.

The goal registration was also attempted through `create_goal` and rejected:
`cannot create a new goal because this thread has an unfinished goal`.
No goal was falsely completed to bypass this restriction. The user can clear
the old goal using the documented `/goal clear` command before registration.

## Remaining work

- Resolve Japanese important-phrase regression before selecting the STT candidate.
- Paired PipeWire playback is complete; paired readback and human listening remain.
- Run paired synthesis readback; keep it separate from human listening.
- Validate the real operation harness on development inputs, then measure all
  20 tasks x 5 trials x 2 languages for baseline/candidate as appropriate.
- Implement only model/runtime improvements supported by those measurements.
- Run all 10 spoken scenarios x 3 trials x 2 languages on the final integration.
- Publish a local results report with complete pass/fail/not-run counts. No push.

Runtime changes currently remain in the repository, not the installed plugin.
The preview server is loopback-only at http://127.0.0.1:35673/index.html.


### Actual PipeWire monitor timing

The real Python worker fed the production `Audio` player, then an isolated
24 kHz mono PipeWire sink was recorded. No physical speaker/microphone was used.
All 80 observations completed without playback errors. Median first sound:
Japanese 1104 -> 803 ms (27.3% improvement); English 1144 -> 763 ms (33.3%).
P95: Japanese 1464 -> 1059 ms; English 1550 -> 1176 ms. The worker peak RSS
was 2,353,824 KiB baseline and 2,321,840 KiB candidate. Raw monitor captures
remain at `/tmp/oma-tts-playback-evaluation`; timings/provenance are copied here.
This establishes the timing improvement on this hardware, not naturalness.


The vocabulary-only Qwen prompt also failed the Japanese critical-phrase gate
(19/23), so it is not selected. No expected sentence was supplied to the model.
The audio-level normalization experiment is kept separate; only its generated
recognition inputs are adjusted after VAD, never the fixed corpus files.


The first 9B development run was stopped after observing GPU contention: the
installed 4B model held about 4.2 GB VRAM in one Ollama daemon while the test's
second daemon loaded almost all of 9B on CPU (0.25 GB VRAM). Its blank-document
operation passed but its latency is not an acceptance measurement. The harness
now uses the same O.M.A. loopback server for model scheduling, without changing
the production default. The unfinished run remains at
`/tmp/oma-agent-eval-9b-development`; its interrupted observations are not passes.

## Progress (2026-09-27)

Real PipeWire monitor capture (isolated 24 kHz mono sink, 20 texts per language
per configuration) measured median first sound at 1104 -> 803 ms in Japanese
(27.3%) and 1144 -> 763 ms in English (33.3%). P95 and maximum also improved.
All 80 playback requests completed without errors. This measures the digital
output monitor, not room acoustics. Human listening is pending. See
`tts-playback-results.jsonl` and `tts-playback-comparison.json` for raw timing.

Additional Qwen 0.6B beam, vocabulary-context and quiet-input gain experiments
all retained the Japanese important-phrase regression and were not selected.
Qwen 1.7B is now being measured using the same frozen corpus and settings.
It passed all 20 development utterances without character errors, but took
median 2.30 s (Japanese) and 1.86 s (English); final results are separate.

The actual 9B operation development run passed blank and mini presentation,
but added a leading newline to literal document text. The newline is present
in the generated tool argument before typing. The normal-mode request instead
called restore_floating and tried to accompany an unrelated window on workspace
2. The workspace guard stopped the run. This is a failed operation, not a user
interruption or successful recovery. The harness now also checks the target
workspace before forwarding an accompany IPC request. It has not yet been
re-run. Raw observations remain at `/tmp/oma-agent-eval-9b-development-v2`.
No 20 x 5 operation matrix or 10 x 3 end-to-end matrix has passed.

### Completed component recognition comparison

Qwen 1.7B (float32 CPU, four threads, Silero VAD) passes both component gates:
Japanese CER 53/751 -> 17/751 (7.06% -> 2.26%, 67.9% relative reduction),
critical phrases 20/23 -> 21/23. English CER 122/1433 -> 10/1433
(8.51% -> 0.698%, 91.8% relative reduction), critical phrases remain 23/23.
False activations remain zero in all 20 non-speech cases per language.
Japanese median processing time increased from 0.992 s to 2.718 s.
Peak process RSS was 12,528,696 KiB. These are separate accuracy, speed and
memory results; the candidate is not described as faster. The actual production
24 kHz PCM/resampling/IPC path is being checked separately before adoption.
Full raw results and comparison are in `asr-final-qwen-1.7b/` and
`asr-1.7b-comparison.json`. The existing installed speech configuration is unchanged.

### TTS integrity checks

Paired Whisper Turbo readback completed for all 80 WAVs. Aggregate character
errors were unchanged (Japanese 42/303 before and after; English 121/633 before
and after). Numbers/spelling contribute to these counts. This is a proxy, not
a naturalness score. A few Japanese transcriptions differ while the aggregate
is equal; `tts-readback-comparison.json` retains them.

Digital capture/reference cross-correlation covered the full reference in every
case, with zero silent 20 ms blocks where the reference was voiced. Minimum
cosine similarity was 0.958 baseline and 0.970 candidate. Eight candidate source
lengths differed from separately generated reference WAVs by 3–9 samples
(<0.4 ms), so the comparison is not claimed to be bit-exact. Raw results remain
in `tts-capture-check.jsonl`. No listening rating or full acceptance is inferred.

### Literal tool arguments

A non-executing Qwen 4B development probe compared plain strings, a nested JSON
object, and arrays of lines. Exact content/whitespace success was 5/12, 12/12,
and 7/12 respectively. All observations are in `tool-format-development.jsonl`.
This does not score desktop task success. The local Qwen Pi integration now
wraps exact-text document/write/edit arguments in a JSON `input` object, then
unwraps them before the existing operation. It never trims user content. Other
providers retain their existing schemas. Actual operation development testing
is in progress. The pre-change Pi source is preserved as `baseline-pi.mjs.txt`.

### Actual operation development, structured arguments

The corrected fixture closes O.M.A. before reloading the disposable editor,
then reopens the face without a greeting. Reloading while the face was open
had left the installed shell's panel state stale; that failed run is retained
at `/tmp/oma-agent-eval-structured-development`, not scored as model success.

The corrected 4B/off run passed 4/6 Japanese and 6/6 English development tasks.
Literal document text and both view modes passed in both languages. Japanese
file creation chose an editor buffer rather than the specified disk path;
Japanese arithmetic answered 3+5 as 15. See
`agent-structured-4b-development.json` for the exact failed replies and tools.
These are development tasks and do not satisfy the 20 x 5 final requirement.
Reported case `seconds` in these early runs include fixture setup; the separate
answer events record model/operation turn time. Do not compare them directly
with recognition or synthesis latency.

## Current checkpoint (2026-09-27, continued)

- Qwen 4B with low reasoning and structured literal tools: 5/6 Japanese,
  6/6 English development tasks. Arithmetic became correct, but violated the
  requested answer-only format. Formatting guidance fixed that instance; a
  subsequent file-path task still chose an unsaved editor buffer, so file versus
  buffer routing descriptions were clarified. No final success is inferred.
- Qwen 9B/low: 6/6 Japanese, 5/6 English; one English request ended with
  `Stream ended without finish_reason`. It was retained as a failure. Typical
  turns were substantially slower than 4B on this 8 GB GPU. See the structured
  development JSON artifacts; no full operation threshold is claimed.
- Real operation subprocesses now use bubblewrap: read-only host filesystem,
  a writable per-case directory, private temporary storage and PID namespace.
  Wayland/Omarchy IPC remains available for the intended real workspace actions.
  Native docking must finish (actual tiles, focused target, stable geometry),
  not merely emit `docked:true`. Repeated runs wait for the closing window to
  actually disappear before starting the next trial.
- A baseline final-matrix attempt is retained at `/tmp/oma-agent-final-baseline`.
  It was interrupted while an unsaved-file follow-up was blocked on yes/no
  approval. No full-matrix score is available from it. The driver now detects
  that its free-form follow-up cannot be handled by the production binary
  approval parser, safely denies/cancels the pending operation and records a
  protocol failure. It does not manufacture approval. Save/discard/cancel
  clarification is now explicitly distinguished from yes/no authorization in
  the candidate skill/tool instructions. A retained modified document is
  required before the follow-up; a particular dialog/tool sequence is not.
- Production-path ASR development passed all 20 utterances. Final Whisper and
  Qwen runs through actual JSON IPC, 24 kHz PCM and scipy resampling are in
  progress under `asr-worker-final-baseline/` and `asr-worker-final-candidate/`.
- The installed plugin and user's speech selection remain unchanged. Temporary
  test settings are restored after each run. An evaluation-owned Ollama server
  is currently on port 11435, logging to `/tmp/oma-evaluation-ollama.log`.

Remaining: finish actual-worker ASR comparison; finish baseline/candidate
20 x 5 x 2 operation matrices with the corrected driver; select/install a local
candidate and run 10 x 3 x 2 spoken scenarios; run the full regression suite;
refresh this report with exact final counts. Human listening and recordings
remain outstanding and must not be represented as completed.

### Completed production-path recognition gate

The actual JSON IPC / 24 kHz PCM / scipy resampling path also passes on the
frozen synthetic final corpus (50 speech + 20 non-speech per language):

| Language | Whisper CER | Qwen 1.7B CER | Relative reduction | Critical phrases | False activations |
| --- | ---: | ---: | ---: | --- | --- |
| Japanese | 59/751 (7.86%) | 18/751 (2.40%) | 69.5% | 19/23 -> 21/23 | 0/20 -> 0/20 |
| English | 128/1433 (8.93%) | 10/1433 (0.698%) | 92.2% | 23/23 -> 23/23 | 0/20 -> 0/20 |

Median processing time: Japanese 0.969 -> 2.585 s; English 0.874 -> 2.327 s.
These are slower recognition times despite better accuracy. The component
benchmark above used a different resampling path and therefore has slightly
different counts; it is not substituted for this production-path comparison.
See `asr-worker-comparison.json`, both `asr-worker-final-*/results.jsonl`, and
`config.json` for startup warmups and peak worker RSS. Human microphone recordings
are still absent. This does not establish real-room microphone accuracy.

### Operation harness correction (2026-09-27)

The baseline matrix `/tmp/oma-agent-final-baseline-v2` was interrupted and is
not an accepted final comparison. Its raw failures remain intact. The goodbye
check incorrectly required disappearance before the 1.23-second closing
animation completed, despite a recorded successful `end_conversation` call.
The check now waits for actual disappearance with a bounded timeout; this time
is included in the operation duration. A regression test reproduces the race.

Repeated development trials (`/tmp/oma-agent-activation-probe-v2`) also reproduced
`OmaText has not become active and ready`. The heartbeat used `send("")`, which
re-summoned the already-open overlay and called `forceActiveFocus()`. Native
editor activation could be false even with compositor focus on the editor.
`send` now avoids re-summoning an already-open panel. Unit coverage passes;
the live follow-up is still pending. Do not count this suspected focus fix as
verified until the repeated real operation completes.

Follow-up: the activation problem recurred after the re-summoning fix. Direct
model-free calls reproduced it in 1/6 and 1/12 trials. Reissuing `omatext`, adding
zero or one pixel virtual-pointer motion, and reopening an unmodified window
did not recover native Qt activation in the observed failure. These diagnostic
attempts are **not** successful operation acceptance runs. No experimental
pointer-motion or reopen workaround was added to production.

The installed Git-managed plugin refused `scripts/install-local` as designed.
For isolated follow-up tests, a separate immutable evaluation build was staged
at `builds/evaluation-6965abbf16b3b73d`; only the already locally modified
manifest's entrypoint paths were switched. The previous manifest is preserved
at `/tmp/oma-evaluation-installed-baseline-manifest.json`. Source checkout and
the plugin's Git-managed sources were not overwritten. Speech selection remains
unchanged. Further source edits after that build are not installed yet.

Additional correctness work, with passing focused regressions:

- Memory removal reports the actual number of matched deleted records instead
  of always returning success for a query that matched nothing.
- New-document results say whether text was already inserted and check the
  native resulting text length. They do not expose a stale input frame inviting
  accidental duplicate typing. Exact content is still checked by the evaluator.
- The operation harness defers dismissal until the text reply finishes, matching
  the production pipeline boundary without claiming to measure audio playback.
- E2E monitoring stops on unrelated window disappearance or loss of unsaved
  content before the user's choice. A spoken choice can be valid without an
  already-open native dialog; document retention remains mandatory.

The complete offline suite passed before the latest memory/document changes:
207 Node tests, 24 Python tests, 45 QML tests. The later focused checks pass but
the full suite must be rerun before completion. Acceptance gates for agent and
end-to-end operations remain unmet.

Deployment verification correction: checking the worker's actual executable
path showed that a manifest rescan had retained the old `4349f28fea7dfbad`
service. Therefore the earlier "activation-fixed" observations did **not**
validate the new Service.qml. Candidate-v3 was interrupted for the same reason.
A complete evaluation build (`evaluation-7b0a195fa4e2e4aa`, including setup
scripts) was staged and the O.M.A. plugin alone disabled/re-enabled. The live
worker path now confirms that build; normal GPT-Live/locale/microphone settings
were verified restored before starting the candidate-v4 matrix. No desktop
shell restart or Git source overwrite was required.

The latest full offline verification passed: 209 Node, 26 Python, 45 QML tests
(`/tmp/oma-evaluation-checks-v3.log`). Candidate-v4 uses frozen source in
`/tmp/oma-evaluation-candidate-v3-source`, Qwen3.5 9B, low thinking, all 200 agent
trials, and passive RSS/VRAM sampling in `memory.jsonl`. Still in progress;
these statements do not mean either operation acceptance gate has passed.

Further harness correction: candidate-v6 screenshots showed that the separate
agent had not forwarded `computerUsing` to the installed UI. The floating face
covered the unsaved-changes dialog, unlike production behavior. Its partial
results remain preserved but are not a valid UI-equivalent final comparison.
The driver now forwards that state through `computerUse` and awaits it before
desktop commands; a captured development screenshot confirms that Save, Don't
Save and Cancel are visible. Development-only discard/cancel cases use different
instructions and fixture text from the unchanged final corpus.

`stage-plugin.py` now makes staging reproducible and verifies the running worker
path. The active evaluation build is `evaluation-f7cedfd52951c684`. Later
`desktop_key` modifier-case handling is in the source and the separate agent's
frozen candidate-v7 tree, but not that installed build yet.

The 9B model metadata reports `thinking.values: [false, true]`, default `true`,
not named effort levels. Thus earlier runs requested Pi's `low` but must not be
described as a bounded short-thinking mode. A development screenshot response
generated over 1,200 tokens at about 11.7 tokens/s and timed out at 150 seconds.
See `ollama-thinking-controls.json` and the
[Ollama thinking controls documentation](https://docs.ollama.com/capabilities/thinking).
The next development comparison disables thinking explicitly. No private
reasoning text is included in this report.

### Development follow-up: coordinate contract and unsaved loss

The 9B/off v7 development run passed 4/8 Japanese cases and 5/8 English cases (one English case not run). The English close request discarded the synthetic unsaved draft before the user selected a choice. This is a critical failure, not a pass; the run stopped. Raw summaries are retained under `operation-diagnostics/qwen9b-off-dev-v7`.

A separate image-only probe established that Qwen3.5 returned normalized 0–1000 coordinates even when prompted for pixel coordinates. The local Qwen adapter now states this contract and maps coordinates to the actual screenshot before dispatch. Other providers retain pixels. See `operation-diagnostics/grounding-probe.json` and its companion note. This fixes a coordinate mismatch, not all model grounding errors. Close-tool responses now explicitly state that closing does not authorize discarding, and the O.M.A. skill requires applying Cancel to the native dialog, rather than only promising to keep it open. These changes are still under development evaluation.

### Native cancellation and pre-action stream recovery

The v14 development run passed 8/13 Japanese and 12/13 English tasks, with
zero detected critical errors. Both cancellation variants passed in both
languages through the real editor dialog. Japanese failures remained in blank
document tool serialization, answer-only arithmetic formatting, discard, and
both append cases; English multiline append still supplied an invalid schema.
The exact failed traces, elapsed times, memory samples and frozen sources are
in `operation-diagnostics/qwen4b-cancel-dev-v14/`. Sampling returned to explicit
temperature 0.2, top_p 1.0 and presence_penalty 1.5, so this is not a
cancellation-only causal comparison against v13.

The subsequent v15 candidate clarifies the single `input` JSON object in tool
descriptions. It permits one repair request only after the local provider reports
`Stream ended without finish_reason`, with no tool started and no spoken text
emitted in that turn. A retry is recorded as a `modelRetry` state event and its
entire time remains inside the measured operation. Any executed action, partial
reply, cancellation, other error, or second failure prevents another attempt.
Unit tests cover those boundaries; actual-operation results are still pending.

### v15 actual development result and v16 visual refinement

The full 26-case v15 development run passed 11/13 Japanese and 13/13 English,
with zero detected critical errors. No `modelRetry` event was needed: all tool
streams completed. This run therefore measures the combined candidate, not
proof of retry recovery. Japanese discard hit the neighboring Save button,
then dismissed Save As without closing the document; the claimed completion
was correctly failed by the actual editor-state check. Multiline append added
an unrequested newline and was also failed. All traces are retained in
`operation-diagnostics/qwen4b-schema-dev-v15/`.

The v16 candidate adds a second visual localization pass on a 384 × 256-pixel
crop around the first candidate, enlarged 2× from the same immutable screenshot.
Both passes receive only the screenshot and target, not evaluation expectations.
An absent/ambiguous refinement fails instead of falling back to the coarse guess.
Coordinates map back to the original screenshot and the existing freshness/input
checks still apply. Each pass's time and usage are retained. ImageMagick is a
checked setup dependency. No desktop click is emitted by the grounding model.
Its actual success and extra latency still require measurement.

### v16 rejected; independent harness mount corrected

Two-pass crop grounding did not stabilize discard: 0/3 success in each language.
Multiline append passed 1/3 Japanese and 3/3 English; combined targeted results
were 1/6 and 3/6. There were no detected critical errors. The full failed run is
retained as `operation-diagnostics/qwen4b-crop-dev-v16/`. The crop dependency and
code were removed from the working candidate, returning to v15's grounding.

The following baseline attempt never reached a model request because bubblewrap
hid the separate `/tmp` harness root. It was interrupted and retained under
`operation-diagnostics/baseline-v16-harness-mount-failure/`, not attributed to
model accuracy. The harness now mounts source and harness read-only before
mounting only the per-case directory writable. A real bubblewrap regression
test verifies both roots can be read, cannot be written, and the case can be
written. The next baseline must use a fresh output directory.

### Short window references and complete baseline accounting

The working candidate gives local models short observation-scoped window IDs
instead of native compositor pointers. Closing/accompanying still resolves the
exact observed address and rechecks PID, title, class, workspace and visibility;
it never infers a target from focus or position. References expire on a new
window listing. This addresses pointer-copy failures without exposing fixture
answers. Unit and full repository checks passed; real model evaluation of this
change is still pending.

The corrected baseline v17 reached real operations: five passed, then one trial
attempted an outside-workspace close, blocked before execution. Default critical
stopping ended the run with 194 remaining rows. The stopped run is retained as
`operation-diagnostics/baseline-v17-blocked-target/`. The v18 harness adds an
explicit baseline-only continuation flag for that exact pre-execution guard,
keeping the trial critical and failed. Actual unrelated-window loss and unknown
critical errors always stop. A fresh complete baseline run is now in progress.

These agent component comparisons use the same staged UI bridge and read-only
editor observer for both frozen agents. They compare operation logic and model
settings, not a replay of every historical UI build. Full voice-pipeline results
remain separate.

## Complete original agent baseline and v19 development

The original agent's full 200 observations are now retained under
`operation-diagnostics/baseline-final-v18`: Japanese 69/100 with one critical
wrong-assistant closure; English 78/100 with zero critical errors. A transient
PipeWire echo-cancel startup failure stopped cleanup after 180 observations.
The 20 never-run English slots were measured with byte-identical source/harness
and settings; `complete-agent-run.py` rejects replacing attempted rows.
The combined result retains both raw runs and repeat-index provenance.

The v19 4B candidate (short window references, existing schema/cancel fixes)
completed development at Japanese 8/13 and English 11/13, zero critical errors.
It therefore does not advance to a final acceptance claim. Japanese failures
include an empty dictated document, repeated normal-mode operations until
timeout, extra arithmetic explanation, extra append newline and missed goodbye.
English discard incorrectly entered binary approval. All failures are retained.
A same-code 9B comparison is running; its result is not yet known.

The working harness now retries restoring the original microphone at most three
times during cleanup, outside scored timing. This is not in the frozen v19 run.
Tests verify bounded retry and propagation of persistent failure.

Fallback research, not measured: Ollama lists Qwen3.6 35B at 23 GB and 27B at
18 GB (<https://ollama.com/library/qwen3.6>). The official 35B-A3B model card
is <https://huggingface.co/Qwen/Qwen3.6-35B-A3B>. Neither has been downloaded
or selected here. Ollama documents q8_0 KV cache as about half f16 memory,
with task-dependent precision loss (<https://docs.ollama.com/faq#how-can-i-set-the-quantization-type-for-the-kv-cache>).
No KV-cache change has been applied; any such experiment requires a separate
recorded configuration and fresh quality measurements.

## v20 native activation recovery

The 9B v19 development run completed at Japanese 10/13, English 12/13, zero
critical errors. Japanese dictation failed because OmaText stayed natively
inactive; two appends added an unwanted newline. English goodbye replied but
did not call the end operation. These remain failed observations.

A direct helper diagnostic reproduced stale native activation: before 9/10,
after 10/10. Two after-run trials entered that same inactive state, then recovered
through an exact same-workspace O.M.A.→editor focus transition and inserted the
correct text. See editor-focus-before-v20 and editor-focus-after-v20. This does
not count as agent acceptance or prove natural speech quality. The after-run
had a background model download, so its timings are not a latency comparison.

## v21 explicit-farewell pipeline and visible-window scope

A first real-voice development probe with Qwen3-ASR 1.7B + Qwen3.5 9B recognized
the Japanese farewell but exceeded the 25-second post-recognition close deadline.
Its raw session metadata shows end_conversation followed by another model stream.
Cleanup also failed restoring audio modules; all remaining cases are not run.
The ordinary provider/microphone/workspace were eventually restored, and only
the two owned leftover test audio modules were explicitly unloaded afterward.
A real Pi SDK cancellation fixture passes even with concurrent aborts, so it
does not establish the SDK as the cause of the live cleanup failure.

The existing conservative whole-utterance farewell matcher now selects a short,
localized tool-free notice in the voice pipeline. It still stores the conversation,
allows interruption, and dismisses only after actual playback drains. Quoted or
compound requests continue through the regular agent. The agent-only harness
does not gain this fallback: its missed-end-tool failures remain failures.

The repeated Japanese development voice case now passes, closing 7.61 seconds
after recognition. The remaining control cases are in progress. These are separate
development utterances generated with Kokoro; final fixtures remain unchanged.
The model download is background development activity, so these runs are not
accepted comparative latency measurements.

Local window lists now include only workspaces actually displayed on monitors
(and visible pinned windows). A saved reference is rechecked against that set
before accompanying or closing. This prevents silently targeting a different,
non-visible workspace. Other providers retain their existing interfaces.

The v21 offline checks passed: 244 Node tests, Python 4+18+16, QML 39+3+3.

### Development voice controls: completed v21, v22 follow-up

The four v21 controls finished with Japanese farewell passing, Japanese modes
failing at the question, and both English cases failing at dismissal. The Japanese
question was recognized as `一度一度足した数だけを答えて。` instead of the fixture's
`一と一を足した数だけを答えて。`. This remains a failure, not an excluded sample.
English `Thanks, bye.` was transcribed as `Thanks. Bye.`; the conservative whole
utterance matcher previously rejected the period between the two words. A
regression test reproduces this and now passes, with quoted/extended sentences
still rejected. v22 is a separate run, not a replacement for v21.

The English opening also produced corrupted punctuation in one actual v21
response despite the fixed-text instruction. The pipeline now sends the existing
English source `Awaiting your command.` directly to synthesis for the default
opening. Other languages still use translation, and explicit notices still use
the model. This change has unit coverage but has not yet been staged or measured
in an end-to-end run. It does not change the TTS benchmark corpus or its scores.

v22 completed: 4/6 passed. Both languages passed standalone farewell and the
neighbor-preserving open/close/goodbye sequence. Both long document instructions
failed the ten-second post-playback recognition deadline. These remain failures.
The new-document waits were 24.69/24.65 seconds and close waits 28.96/35.18 seconds
(Japanese/English), so this is not acceptable interactive speed yet.

Inspection found that cancelling a speculative local transcript killed the shared
Python process, unloading both ASR and TTS. Cancellation now rejects and ignores
that request's result without unloading models; synthesis cancellation and request
timeouts still kill the worker. A regression test verifies reuse and rejection of
late partial text. Real v23 results are separate and still being collected; no
performance gain is claimed from that unit test.

v23 completed: 1/4 passed. English mini/question/normal/goodbye succeeded. Both
long document instructions still exceeded the unchanged recognition deadline;
their eventual transcripts are recorded. Japanese question recognition still
confused `一と一` with `一度一度`, and that scenario failed. State telemetry now
covers injected speech playback as well as waits; Japanese write reached the
listening state at 12.06 s and thinking at 25.23 s, so lack of microphone onset
is not the explanation for that v23 failure.

The full offline v23 checks before the subsequent LocalSpeech cancellation edit
passed 246 Node tests plus the Python/QML suites. Cancellation-specific tests
passed afterward. A final full check is still required for subsequent changes.

### ASR CPU experiments and model screening (v24–v25)

A development-only sweep used two fixed utterances per language (short arithmetic
and long document instruction), two repeats, in alternating 4/8/16-thread orders.
All float32 transcriptions stayed identical across thread settings. Long-utterance
medians for 4 → 8 threads were Japanese 9.183 → 8.063 s and English 7.899 → 6.857 s.
Sixteen threads was slower than eight. The worker now shares its existing bounded
eight-thread TTS budget with Qwen recognition. Final-corpus recognition must be
remeasured for this change; the earlier final scores belong to the four-thread
snapshot and are not silently relabeled.

Dynamic int8 Linear quantization was also tested as a separate prototype, not
adopted. At eight threads, long-utterance medians were 3.586 s Japanese and 3.178 s
English, but recognized text changed. Initial quantization took 18.287 s. The
in-process end RSS actually increased (8,795,776 → 11,410,348 KiB) because this
conversion retains allocations; peak RSS was 12,546,192 → 12,546,932 KiB. Thus
these measurements do not establish a memory saving. Cached tensor-only reloads
reproduce all four probe transcripts, but loading is still 22.05 s initially,
15.34 s with small placeholder modules. The latter includes 2.51 s checksum,
0.05 s architecture, 0.02 s placeholders, 0.83 s tensor read, 11.47 s state packing.
The 3.1 GiB cache remains outside the repository. It loads with weights_only=True;
no model-code pickle is loaded. This API is deprecated in the installed PyTorch
2.8, another limitation to address before adoption.

Qwen3.6:35b's synthetic coordinate probe returned 4/6 valid points. Two outputs
had malformed JSON. Supplying the API's JSON schema yielded 6/6 correct points;
raw invalid responses remain archived. The actual local grounder now constrains
coordinate output, retaining null/invalid/out-of-bounds rejection and fresh-frame
checks. Model compatibility is optional; the default remains unchanged.

The 35B development operation run was stopped: blank and exact dictation passed
but each took about 60 s; mini mode failed by switching back to normal (52.08 s).
The next in-flight task is interrupted and all remaining slots are not run. This
is rejected/incomplete development evidence, never a successful matrix. Settings
were restored. A 9B run with zero presence penalty uses the same frozen v24 code
and development cases to compare literal copying and action behavior.

A read-only extraction of actual tool-result images from the failed English
9B discard session confirmed the Save/Don't Save localization problem. Only
those synthetic-test images were extracted, not private reasoning/session data.
At the production 1440-pixel screenshot width, button glyphs are about six pixels
high. Tesseract did not reliably recognize them, including a separate upscale
probe. Therefore the exact-label OCR parser remains evaluation-only and is not
connected to production clicks. It refuses partial, duplicate and low-confidence
labels. No OCR success or improved live clicking is claimed.

The following 4B run passed Japanese discard, cancellation, multiline appending and
goodbye, but responded to a new-document request with an explanation of O.M.A.'s
name. The skill's three overlapping identity paragraphs were consolidated into
two, retaining the name, aliases, pronunciation and language behavior while
explicitly separating OmaText from the assistant. This new instruction revision
is not part of the running v26 comparison; it requires its own development check.


### Completed zero-presence development comparisons (v25–v26)

Using the same frozen v24 runtime, 9B scored Japanese 12/13 and English 12/13,
with zero critical errors. Japanese cancellation and English discard each timed
out around 151 seconds. The English discard trace showed a click on Save instead
of Don't Save, followed by recovery attempts; this remains a failure.

4B scored Japanese 11/13 and English 13/13, with zero critical errors. Japanese
new-document creation returned an identity explanation instead of opening the
editor. Japanese exact appending inserted an unrequested newline: actual bytes
were `Plan: A!\n火曜日`. The model supplied this newline in the tool argument;
the append implementation did not insert it. No grader normalization or removal
of these failed cases was performed. Both runs restored the prior UI selection.

Raw results, environment, sampling, memory, source/harness archives and verified
compressed traces are preserved under `qwen9b-zero-presence-dev-v25` and
`qwen4b-zero-presence-dev-v26`. These 26-trial development runs do not replace
the required 200-trial final operation matrix. The consolidated identity skill
belongs to v27 and is evaluated separately.


### v26 final recognition remeasurement and v27 checks

The eight-thread Qwen worker retained the exact final-corpus edit counts:
Japanese 18/751 and English 10/1433, versus Whisper Small 59/751 and 128/1433.
Critical recognition was 21/23 and 23/23 versus 19/23 and 23/23; both models had
zero false activations in each language's 20 silence/noise cases. All 140 cases
per configuration completed, with no missing/failed rows. Candidate medians were
2.259 s Japanese and 2.105 s English; baselines 0.934 s and 0.878 s. Peak worker
RSS was 12,507,072 KiB versus 1,436,896 KiB. First Japanese warmup was 8.333 s
versus 2.407 s. Thus recognition accuracy passes, but it is slower and larger.
The fixtures are synthetic; no human-recording robustness claim is made.

Full offline tests passed before staging v27. The isolated build is
`evaluation-30366d58a7520317`, original manifest backup is
`/tmp/oma-before-v27-installed-manifest.json`. The current 26-trial development
matrix uses frozen v27 source and the same 4B zero-presence settings; its results
are not yet final acceptance.

### v27 preflight failure, v28 development completion and final start

The first v27 matrix never attempted an operation: all 26 slots are not_run.
Its temporary microphone switch failed with PipeWire no-global/unknown-resource
errors. The harness restored the prior settings and removed its owned modules.
Ten subsequent standalone EchoPath startup/close cycles all succeeded, without
restarting system audio; this does not establish a root cause or prove that the
race is fixed. The failed preflight is retained in `agent-preflight-v27`.

A separate run of the same frozen v27 source completed Japanese 13/13 and English
12/13 development tasks, zero critical errors. English discard clicked Save,
then cancelled Save As, then falsely claimed closure; the real modified editor
remained open, so this is a failure. The results are in
`qwen4b-zero-presence-dev-v28`, with verified compressed traces and restored
selection evidence. Full offline checks before staging passed 250 Node tests,
Python groups of 4, 18 and 16, and QML groups of 39, 3 and 3.

The frozen v27 source is now running the original final 20 tasks × 5 repeats per
language with 4B/low, temperature 0.2, top_p 1 and presence penalty 0. No expected
text or case has changed. This run is `/tmp/oma-agent-final-4b-zero-presence-v28`;
no final success is claimed while it is running. Early failures include creating
a blank document, using the native window address as a screenshot frameId for
subsequent typing, and claiming completion after that input was rejected.

An accessibility read-only probe found the session AT-SPI bus, but the published
Quickshell application entries had no children (and one stale bus address).
There is no demonstrated accessible button tree to replace image grounding.
No accessibility actions or production changes were made from that probe.

### Supplemental keyword metrics and unmeasured recognition preparation (v29)

A supplementary report now counts each frozen critical-word alternative group
once, without changing the original whole-phrase gate or corpus. Japanese
keyword accuracy is 28/32 → 30/32, English 31/31 → 31/31. Missing/error rows block
numeric accuracy. Raw inputs are identified by SHA-256; report source and failure
groups are archived. The evaluation unit suite now has 18 passing tests.

Code inspection found that greeting synthesis loads Kokoro but leaves recognition
unloaded until the first speech request. A separate candidate adds an explicit
local-only recognition preparation request after greeting PCM is queued. It does
not wait for preparation before returning/playing, does not transcribe fabricated
audio, shares in-flight/completed preparation per language, and resets on worker
shutdown. Unsupported Qwen languages still prepare Whisper. Real transcription
continues to surface loading errors; a failed optional preparation may retry.

Focused checks passed: 22 Node tests and 5 Python tests. This candidate is frozen
at `/tmp/oma-evaluation-candidate-v29-source`; it is NOT installed or used by the
running v28 final matrix. Its real latency, accuracy and memory remain unmeasured.
The staged v27 worker and all v28 measurements retain their own hashes.

### v30 farewell routing and v31 companion validation

The v28 Japanese final matrix ended at 89/100, zero critical errors. The candidate
was rejected. English was stopped after its first full repetition (18/20), leaving
80 not_run entries. No successes are transferred into later matrices. Raw results,
stop reason, source/harness, sampled memory and gate report are archived under
`qwen4b-final-v28-incomplete`. Successful Japanese latency median was 5.165 s,
p95 18.060 s; failed attempts include a 151.256 s timeout. These are distinct.

The existing conservative whole-utterance farewell matcher now also routes Pi
text input through the same conversation-ending action and a localized notice.
It is production lifecycle routing, not an evaluation-specific expected answer;
quoted/extended requests still go to the normal agent. Its operation scores must
be described as system behavior, not purely model-selected tool accuracy. New
regression tests include Japanese/English farewell, translation and an extended
request that must not close. Full v30 checks: 254 Node; Python 5/18/18; QML 39/3/3.

The v30 development run exposed a bridge discrepancy: Japanese 0/13, English
13/13. After creating the first blank document, the model selected O.M.A. as the
accompany target. The evaluation IPC forwarded it into a host-level fatal error,
whereas normal tool execution keeps a rejected target as a tool error. That
retained error caused subsequent Japanese setup failures. All remain recorded.

The v31 evaluation bridge shares production companion-target validation before
IPC. Production itself now validates a new target before dismantling an existing
valid layout. An invalid/self target therefore makes no geometry changes. The
regression reproduces the old unwanted restoration and passes with the fix.
The v30 queued recognition/voice comparison did not run because the development
gate failed. v31 is frozen separately; no existing observation was rewritten.

The staged v31 build is `evaluation-58b57733401c81a5`, backup
`/tmp/oma-before-v31-installed-manifest.json`. Full checks passed 255 Node,
Python 5/18/18, QML 39/3/3. Its 4B development matrix completed Japanese 10/13,
English 12/13, zero critical errors. Failures: Japanese exact/multiline append
added unrequested newlines; both languages chose a binary confirmation for a
save/discard/cancel follow-up. Both explicit farewells closed successfully.
All results are in `qwen4b-dev-v31`; neither final agent acceptance nor a stable
4B candidate is claimed. The fixed-corpus speech remeasurement proceeds
independently, followed by voice diagnostics and a 9B development comparison.

Synthetic-input limitation: an expected-text mismatch in the generated Japanese
arithmetic prompt does not by itself distinguish an ASR error from a source-TTS
pronunciation error. No human listening adjudication or real-speaker recordings
are available. The original expected text and the failed observation stay in the
evaluation; neither is silently normalized away or excluded.

### v31 recognition passed; long voice instructions still failed

The paired v31 actual-worker run again passed both fixed-corpus recognition gates:
Japanese 18/751 versus 59/751 edits, English 10/1433 versus 128/1433, unchanged
critical/noise scores. Median latency was 2.298/2.038 s versus 0.934/0.891 s;
peak RSS 12,508,892 versus 1,437,172 KiB. The original raw run and worker snapshot
are in `asr-worker-final-v31-*`.

Voice development v31 scored Japanese 2/4 and English 3/4, zero critical errors.
Both long document instructions missed recognition within 10 s; Japanese mini
mode's arithmetic reply also failed. The original threshold/inputs were retained.
A separate v32 configuration disabled OMA_EARLY_TRANSCRIPTION in the isolated
Service.qml command; both long instructions still failed (0/2). This switch is
not adopted. Its source/configuration/failed results are archived separately.

The v33 diagnostic worker recorded timestamps, audio duration, processing time
and text length, not speech contents. Its Japanese final 13.739-second recording
took 11.645 s processing plus about 4.96 s queueing (16.607 s total); recognition
preparation itself took 1.241 s. English also queued behind cancelled preview
work. This confirms both inference cost and queueing; preloading alone is not a
sufficient fix. The diagnostic build was restored to v31 after the run.

### v34/v35 full int8 candidate rejected

Tensor-cache probes compared x86, fbgemm and oneDNN at eight threads. Load times
were 16.217, 15.111 and 5.924 s respectively; oneDNN state packing was 1.953 s
versus about 11.2–11.4 s. oneDNN long-utterance development times were 4.013 s
Japanese and 2.975 s English. Cached oneDNN peak RSS was 6,699,404 KiB, lower than
the earlier in-process conversion prototype; the conversion and cached-load
memory results must not be conflated.

The full actual-JSON/24-kHz int8 worker comparison failed acceptance. Japanese
48/751 edits (6.39%) improves only 18.64% over 59/751, below the required 20%.
Its critical score was 19/23, equal to baseline. English 14/1433 edits improved
CER but its critical score fell from 23/23 to 22/23. Both retained zero noise
false activations. Medians were 1.016 s Japanese and 0.871 s English. All 140
cases completed per configuration; none were removed. This candidate is not
adopted. The wrapper, underlying worker, tensor-cache metadata, input hashes,
raw observations and gate report are retained under `asr-worker-int8-final-v35-*`.

The next development candidate quantizes only language-model Linear layers,
keeping the audio encoder, multimodal projection and output head in float32.
This is a uniform architectural choice, not a phrase-specific correction.


### v36 decoder-only int8 rejected

The decoder-only cache retained float32 audio encoder, projector and output head.
Its cached load took 5.737 s; development long inputs took 4.719 s Japanese and
3.884 s English (separate raw probe retained). The paired fixed-corpus actual-worker
run completed all 140 inputs per configuration. Japanese edits fell 59 -> 35 of
751 (40.68%), but critical phrases fell 19/23 -> 17/23, failing acceptance.
English edits fell 128 -> 29 of 1433 (77.34%) with critical phrases 23/23 unchanged.
Both noise scores were 0/20. Candidate medians were 1.205 s Japanese and 1.026 s
English, versus 0.946/0.880 s baseline. Worker peak RSS was 6,626,660 KiB versus
1,436,340 KiB baseline. No cases or critical expectations were
changed. This configuration is not adopted. Raw results, actual worker wrapper,
base worker, cache tensor hash/module definitions and environment are retained.

### v37 cooperative recognition cancellation

A dedicated JSON reader now receives cancellations while the one inference
thread runs. Cancelled queued requests are skipped; Qwen decoding stops at a
generation boundary without unloading ASR/TTS. Whisper checks between segments.
Model loading and an individual forward pass are not forcibly interrupted.
Synthesis cancellation and request deadlines still terminate the worker.

Regression tests cover in-flight/queued cancellation, model reuse and ignoring
late transcripts. The full repository suite passed. A paired actual-worker
development probe sends the same eight-second preview, cancels after 0.8 s,
then submits the complete long instruction, three times per language.
Median final-request latency improved Japanese 13.839 -> 9.349 s (32.44%) and
English 12.098 -> 7.276 s (39.86%). All six final texts matched their baseline
counterparts. These are synthetic development inputs, baseline-first order,
not the final end-to-end gate. Original input hashes, workers, JSON response
events and timing rows are in `asr-cancellation-v37-*`; the comparison JSON
keeps the paired equality checks. The old worker reports the new cancel command
as unknown after finishing its preview; this does not cancel baseline work.

The Qwen hook follows the Transformers StoppingCriteria API:
https://github.com/huggingface/transformers/blob/main/src/transformers/generation/stopping_criteria.py


### v37 9B operation development

Qwen3.5 9B/low with .2/1/0 sampling passed Japanese 13/13 and English 11/13,
zero critical errors, on the v37 source. English discard missed its button and
timed out; English extended goodbye answered without ending the session.
Successful medians were 26.529/23.740 s; the model used CPU for 13 of 34 layers.
The complete observations, allocation metadata, sampled memory, failed screen,
and verified source/traces are under `operation-diagnostics/qwen9b-dev-v37`.
This is not a final acceptance run and does not justify replacing the default.

### v37 voice result and v38 CPU placement

The eight voice development scenarios finished Japanese 3/4 and English 2/4,
zero critical errors. Both long document inputs still missed recognition within
10 s. English empty-with-neighbor opened/closed the editor correctly but failed
to end O.M.A. The final recognized text was only `Thanks.`; `Bye` was absent.
This is not evidence that a correct goodbye transcript was ignored. Capturing
the injected synthetic PCM in a separate diagnostic build is the next check.
All original evidence is under `operation-diagnostics/voice-cancellation-dev-v37`.

A paired ASR-only development comparison on the same v37 worker restricted its
process to physical performance cores 0,2,4,6,8,10,12,14 on this i9-14900K, versus
the normal 0-31 mask. Each used the same six long-input/cancellation trials.
Japanese median final-request time improved 8.640 -> 7.086 s (17.99%); English
7.785 -> 6.079 s (21.92%). All paired final transcripts matched. Peak worker RSS
was 12,422,880 / 12,426,888 KiB. The source, input hashes, actual CPU masks, events
and comparison are saved in `asr-affinity-v38-*`. Baseline-first order remains a
limitation. This is not a final-corpus accuracy or end-to-end result.

The working candidate exposes optional `asr_cpu_affinity` in local/speech.json.
It restricts only recognition, then restores existing and newly created worker
threads even after cancellation; TTS retains its original CPU placement. No
hardware-specific CPU numbers become a global default. This implementation still
requires the actual-worker and voice checks; the measurement above pinned the
whole standalone ASR probe with taskset.

### Rename helper under development

The ongoing v37 final matrix exposed copy-only rename attempts that left the
original filename. A new generic rename_file tool uses GNU mv without copying
or overwriting any existing destination, verifies the old name disappeared and
the inode was preserved, and supports quoted/Unicode paths without a shell.
Unit tests passed for exact bytes, destination conflicts, directories, dangling
links and cancellation. Separate development tasks use a spaced rename target
with CRLF content and a partial replacement with an existing newline. This
expands development from 13 to 15 tasks per language; comparisons must separate
the original 13 from these two new tasks, not inflate a success rate by changing
the denominator. The original 20 final tasks/expectations are unchanged; the
new helper is not present in the running frozen v37 matrix. Rename verification
now accepts case-specified targets/fixtures and compares exact bytes; the final
case still requires removing note.txt and preserving exactly Seed. in renamed.txt.

### Approval guidance consistency (not yet behaviorally measured)

The v37 English discard traces repeatedly ask the normal three-way question,
then invoke binary approval after the user explicitly chooses discard. The
document workflow already says that this choice is authorization, but two later
general approval paragraphs did not state the exception. Both now reference the
same document-specific exception. No runtime approval bypass or phrase matcher
was introduced. Skill structural validation passes; behavioral improvement is
unproven. This edit is absent from frozen v37, v40 and v41 runs, which retain
their original guidance and results.

### Complete v37 operation acceptance

All 200 observations completed: Japanese 87/100, English 88/100; both gates fail,
with zero critical errors. Successful-operation medians were 4.717/4.500 s,
p95 17.818/11.605 s, maximum 22.634/17.796 s. Failed-operation maxima were
132.974/150.940 s; failures are not excluded from the dataset. Japanese failures
include four copy-only renames, two multiline and two replacement failures;
English failures comprise four duplicate discard confirmations, five append
errors and three replacement errors. Source, environment, every observation,
454 verified trace files and acceptance reports are retained under
`operation-diagnostics/qwen4b-final-v37`. Memory sampling recorded 1,247 samples,
zero errors, peak runner RSS 9,107,824 KiB and whole-device VRAM 6,866 MiB;
Ollama reported model allocation/VRAM 4,197,596,527 bytes at context 32,768.

The subsequent diagnostic preflight failed before any voice trial because the
frozen source linked node_modules and omitted demo/run. No failed voice case
was retried or rescored. Full-validation copies now materialize dependencies
and the omitted demo with explicit hashes, without changing runtime sources.
The reusable freezer now supports --copy-dependencies and includes demo. Its
new test verifies independent copied dependencies, required demo content and
exclusion of unrelated private files. Evaluation unit suite: 19 passing.

### v40 synthetic-input diagnostic

English empty-with-neighbor completed 3/3, zero critical errors, with ASR-only
physical-core affinity. All three goodbye responses were Thanks. Bye.; nine
actual production recognition-input WAVs were captured and hash-verified. The
v37 Thanks. failure did not recur and remains unresolved, not rescored. Captures
were enabled only while the test controller marker was live; the marker was
removed and ordinary v39 restored. The full source suite passed after dependency
materialization. This is development evidence, not final voice acceptance.
Source, traces and synthetic audio are in operation-diagnostics/voice-audio-dev-v40.

### v41 actual-worker fixed recognition corpus

Both 140-case runs completed. Whisper Small -> Qwen3-ASR FP32 with recognition-only
physical-core affinity retains Japanese 59 -> 18 edits /751 characters (69.49%
relative reduction), critical phrases 19/23 -> 21/23; English 128 -> 10 /1433
(92.19%), critical 23/23 -> 23/23. Noise false activations remain 0/20 per language
for both configurations. All 140 candidate raw transcripts exactly match v31.
Median processing is 0.938 -> 1.876 s Japanese, 0.874 -> 1.645 s English. Candidate
p95/max is 2.712/2.942 s Japanese, 2.173/2.787 s English. Worker peak RSS rises
1,437,528 -> 12,513,568 KiB. First Japanese warmup is 2.561 -> 6.245 s. Accuracy
gates pass; this does not make Qwen faster or smaller than the original baseline.
The earlier v31 Qwen medians were 2.298/2.038 s, but those runs occurred at a
different time. Environment, source, sampling configuration, every raw observation,
keyword details and paired report are archived as asr-worker-final-v41-* and
asr-worker-v41-comparison.json. All measurements remain synthetic; baseline-first
order and reused fixed acceptance corpus limitations still apply.

### v41 operations and native edit schema correction

Development completed 13/15 Japanese, 14/15 English, zero critical errors. The
original 13-case subset is 12/13 in each language; both added rename cases pass.
Japanese failures were unwanted append characters and repeated malformed edit
arguments. English discard clicked inaccurate dialog targets and left the draft
open. Full checks: 258 Node, Python 7/19/18, QML 39/3/3 passing.

The current Pi native edit tool already stores text in structured edits[] objects
and supplies native path/edits prompt guidance. Wrapping it in input created a
conflicting argument shape. v43 retains native edit unchanged while preserving
literal wrappers for flat-text write/append/new-document tools. A regression test
first failed on the extra wrapper, then passed through the actual native file
edit, preserving CRLF and trailing spaces. 25 focused Node tests pass. The v42
model comparison intentionally retains the old schema so model effects remain
separate. New source and validation dependencies are frozen under v43.

### v42 4B Q4 operation development

With consistent document-choice approval guidance, Q4 scored Japanese 12/15 and
English 15/15, zero critical errors. Original 13-case subset: 11/13 and 13/13.
Japanese math returned extra explanation, append inserted literal backslash-n,
and replacement still used the rejected extra input wrapper. Both discard and
rename scenarios passed in this small run. No final acceptance follows from this.
180 memory samples had zero errors; runner RSS peaked at 6,090,672 KiB, whole
GPU at 6,788 MiB, model/GPU allocation 4,197,596,527 bytes. The same-source Q8
comparison is separate and ongoing. All Q4 raw evidence is qwen4b-dev-v42.

The official Ollama qwen3.5 tag list currently lists 4B Q4_K_M, Q8_0 and BF16,
not an intermediate Q5 tag: https://ollama.com/library/qwen3.5/tags . Current
import documentation says GGUF quantization is prepared with an external GGUF
tool before import: https://docs.ollama.com/import . No intermediate model was
downloaded, constructed or adopted based on this research.

### v42 Q4/Q8 comparison completed

Both variants scored Japanese 12/15 and English 15/15, zero critical errors.
Original 13-task subset is Q4 11/13 ja,13/13 en; Q8 10/13 ja,13/13 en. Q8 passes
the added replacement but fails a different append and times out on Japanese
discard. Successful medians: Q4 6.752/4.536 s versus Q8 18.970/18.306 s. Q8
failed maximum is 151.159 s. The server offloaded 25/34 Q8 layers to GPU versus
34/34 for Q4. Q8 sampled RSS 4,490,316 KiB, whole-device VRAM 7,303 MiB, model
allocation 6,812,482,924 bytes and model GPU allocation 4,701,321,951 bytes.
These quantities are deliberately separate. Q8 is not selected: equal observed
success counts and substantially worse latency. Q4-first order and the small
development sample remain limitations. Sources and all observations are archived.

### v43 operation development and pending-decision guard

Native edit correction scored 14/15 in both languages, zero critical errors.
The original 13-case subset is 12/13 each; added rename and replace pass in both.
Japanese multiline append still adds literal backslash-n, and English explicit
discard again triggers binary approval. All source checks passed (259 Node,
Python 7/19/19, QML 39/3/3); 68 raw trace files are retained.

Because wording alone did not prevent redundant approval, v45 adds a runtime
check only when an application-close request is recorded. It refreshes current
windows, drops stale targets, and reads native OmaText state. A visible, modified
OmaText document with a pending modal cannot become binary approval; a tool error
explains the ordinary save/discard/cancel flow. It grants no approval and performs
no GUI action. Unrelated consequential actions wait until this document decision
is resolved. Gone targets, resolved modals and other applications retain normal
approval; explicit denial still denies. Two regression tests first failed and
then passed; 27 focused Node tests pass. The guard is frozen separately as v45,
not mixed into ongoing v43 voice trials or the original baseline.

### v43 voice cleanup failure and v46 audio lifecycle

Japanese development voice: 4/4 passed. English document assertions completed,
but microphone restoration failed; that trial is cleanup_failed and the other
three are not_run. Raw evidence is voice-dev-v43-cleanup-failure. No failed or
unrun slot is counted as a success. Host PipeWire recovered on worker replacement
without a service restart; remaining test-owned virtual modules were removed.

v46 combines the pending-document guard with awaited playback/recorder/echo-owner
termination before rebuilding an audio path. A bounded owned-process helper
escalates TERM to KILL and waits for closure. Focused tests demonstrated the old
ordering failure. Full checks pass: 264 Node, Python 7/19/19, QML 39/3/3. The live
silent lifecycle test passed 12 repeated rebuilds, verified no surviving owned
processes/nodes and unchanged physical defaults. The causal link to the previous
PipeWire stall still needs application-level voice verification.

### v46 operation development and v49 window-order correction

v46 scored Japanese 14/15 and English 14/15, zero critical errors. The Japanese
failure was an arithmetic answer. The English discard follow-up selected cancel,
then a desktop click, and left the draft open; binary approval did not occur.
Both multiline append and native replacement passed in this small run. All 30
observations and 68 traces are retained under qwen4b-dev-v46.

The ensuing voice run exposed a floating-window restoration failure after the
Japanese document closed. WindowCompanion emitted docked:false before restoring
compositor geometry. During desktop use, that signal permits Overlay to hide and
replace the Wayland surface, invalidating the previously captured address. v49
restores geometry before emitting the visibility-changing signal. A regression
test failed on the old order and passes with the change (14 focused tests).
An opt-in no-inference real-window test exercises target closure during desktop
observation; its before/after results are pending. This ordering fix is not yet
claimed to resolve all application-level layout failures.

The playback timing report now rejects missing/duplicate/different-text/errored
observations and p95/maximum regressions. It explicitly leaves continuity and
listening separate. A test covering these refusal cases failed before the metric
was implemented; all 20 evaluation Python tests now pass. Frozen runtime v49
includes this reporting harness and the window-order change; prior runs remain
associated with their original frozen sources.

### v47 repeated synthesis and v50 validation

The new paired actual-worker/playback run has all 80 observations, no errors.
Japanese audible median 1098.756 → 762.426 ms (30.61%), English 1106.720 → 790.167
ms (28.60%); p95/max improve in both. RSS 2,293,520 → 2,341,192 KiB, so memory
increased slightly. Median generation improves; worst English RTF increases
.250 → .255. All 80 captures cover prior reference WAVs without silent 20 ms
voiced replacements. Six candidate source lengths differ by 1–5 samples from
prior renders; listening and independent readback remain separate. Raw PCM is
persisted under ~/.local/share/oma/evaluation/tts-playback-v47/raw with hashes.

The new source samples have a separate blind page. Rating persistence is keyed
by a hash of the actual sample dataset, preventing ratings of older samples from
silently carrying over. No human rating exists. The v47 audio, termination helper
and Python worker are byte-identical to v50; only unrelated window/report code
changed afterward.

The no-inference real-window restoration probe passed 5/5 on both v46 and v50.
Thus the original application-level failure was not reproduced by this narrow
probe; it does not establish the hypothesized ordering race as the sole cause.
The deterministic ordering regression does show the old early visibility signal.
v50 full checks pass: 265 Node, Python 7/19/20, QML 39/3/3. Voice scenario failures
now retain elapsed seconds as well as errors. Prior result files are unchanged.
The full original-baseline voice matrix is now running before candidate final
operation and voice measurements.

### v50 original voice baseline stopped; v51 worker isolation

The original voice baseline was stopped after discovering native `write` created
/home/komagata/Projects/test.txt instead of opening the requested editor. UI
workspace isolation did not constrain filesystem tools. This is a post-run
critical isolation finding, retained alongside the original raw scoring; it is
not excluded or called a success. Birth time and the non-atomic write implementation
show the file was newly created by this trial. Its exact synthetic contents, hash
and relevant tool calls are archived, then the verified new file was removed from
the original location. No user file was overwritten. Japanese raw results are
10 passed, 2 failed, 18 not_run; English 30 not_run. One raw not_run Japanese modes
slot was partially attempted and interrupted during farewell. See the incident
sidecar instead of treating it as an unattempted or completed trial.

The queued final agent/candidate voice runs were cancelled before starting.
Normal settings and the v50 build were restored. v51 adds an opt-in evaluation
wrapper: the real worker and its children see the host filesystem read-only,
private /tmp, and only a prepared private data/workspace as a writable directory.
Models are reused read-only, while settings, Pi state and transcripts are private.
VoiceDesktop now follows OMA_DATA_DIR for transcript and diagnostic reads. Staging
archives its wrapper and profile metadata with the measured source. Desktop IPC
remains real/shared; this is not a hostile-code security sandbox and existing
unrelated-window and unsaved-document guards remain necessary.

A real bwrap regression test rejects writes to a protected host fixture and permits
writes to the private workspace. The running worker mount table confirms / is ro
and the profile is rw. All full checks pass: 265 Node, Python 7/20/21, QML 39/3/3.
The new bilingual document/log voice smoke run is in progress; Japanese document
and log sequences have passed, with no direct host file writes. All final voice
comparisons must use this same protection on both baseline and candidate.

### v47 independent readback completed; v52 matched operation matrix started

All 80 current source WAVs were read back through independent Whisper Turbo CPU
int8 decoding (beam 5, VAD on). Per-case edit counts do not worsen: Japanese totals
43/303 for each variant, English 121/633 for each. Seven transcript strings differ;
outputs are not described as text-identical. Number-format conventions account
for many edits. This is an ASR proxy and does not rate naturalness. Kokoro cache
revision is f3ff3571791e39611d31c381e3a41a3af07b4987. Raw paired results are archived.

Protected voice smoke v51 completed 4/4 bilingual document/log sequences. v52
starts matched fresh operation baselines/candidates and voice baselines/candidates,
with the same filesystem protection. Agent memory is now imported beside the
selected Pi implementation, so the retained baseline also uses its original
memory return behavior. A common current UI/safety bridge is used for component
operations; full voice runs use each configuration's complete original/candidate
runtime. Baseline-only continuation is limited to lost disposable test drafts or
outside-workspace targets refused before execution; such critical failures stay
in the score. Other critical failures still halt the matrix. Candidate runs have
no continuation exceptions. Fresh private profiles prevent changes to ordinary
user settings and conversation history.

The worker-isolation regression now places its protected fixture under the real
home filesystem, outside any explicit source bind, and verifies root/home remain
read-only. The running agent-profile worker also reports both / and /home as ro,
with only its private profile rw. Portable CI declares the bubblewrap dependency
explicitly; that remote workflow has not been run because nothing is pushed.
