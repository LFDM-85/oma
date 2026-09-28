# Local voice AI evaluation

**The overall goal is not yet achieved.** Recognition and synthesis machine
measurements meet their component thresholds on the frozen synthetic corpus.
Agent operations still miss the threshold: the complete v37 matrix scored
Japanese 87/100 and English 88/100, with zero critical errors in both languages.
The earlier v28 run scored 89/100 Japanese and stopped English at 18/20, with
80 slots retained as not_run. Voice end-to-end acceptance remains pending.
The first full-matrix original-baseline voice attempt was stopped for a filesystem
isolation gap: it created a new synthetic test file outside its test directory.
[Evidence and interruption details](operation-diagnostics/voice-final-baseline-v50-interrupted/README.md)
are retained; the file was preserved as an artifact and removed from its original
location. Final voice runs are being moved to a read-only worker filesystem with
private settings, transcripts and workspace, identically for both configurations.
Human listening and recordings from actual speakers are not available.
The frozen acceptance corpus has been reused to check successive candidates;
these are repeated acceptance checks, not an untouched statistical holdout.
Failed configurations remain recorded. No phrase-specific correction, expected
transcript changes or removal of failing cases is used to pass a gate. Generalization
to unseen speakers still requires new human recordings and listening assessment.
The latest eight-thread recognition worker was remeasured on the fixed final
corpus (v41), now with optional recognition-only CPU affinity; all recognition
accuracy gates still pass. Recognition preparation
and a shared farewell route are implemented, but operation and end-to-end gates
are still unmet. Component timings do not establish end-to-end responsiveness.

## Current machine measurements

The latest completed development voice run, [v46](operation-diagnostics/voice-dev-v46/README.md),
completed all eight trials without cleanup failures: Japanese 2/4, English 4/4.
Japanese failed floating restoration after document close and recognition of a
short arithmetic request. These remain failed. The earlier [v43 cleanup failure](operation-diagnostics/voice-dev-v43-cleanup-failure/README.md)
is preserved, including its three unrun English slots. Full end-to-end acceptance
is still pending.

Recent development voice runs are retained separately: [v22](operation-diagnostics/voice-files-dev-v22/README.md)
passed both bilingual farewell and neighbor-preserving open/close sequences,
but both long document instructions missed the recognition deadline (4/6 total).
[v23](operation-diagnostics/voice-resume-dev-v23/README.md) passed English mode
changes/question/goodbye, but missed both long-input deadlines and misrecognized
the Japanese arithmetic question (1/4 total). These subsets do not satisfy the
required 60-trial final end-to-end matrix.

### Recognition: actual production worker path

Both configurations use the same frozen 24 kHz PCM inputs, production JSON IPC,
resampling, language selection and VAD conditions. Each language has 50 final
utterances and 20 silence/noise cases. Separate development inputs are retained.

| Language | Whisper Small CER | Qwen3-ASR 1.7B CER | Relative reduction | Critical phrases | Noise false activations |
|---|---:|---:|---:|---:|---:|
| Japanese | 59/751 (7.86%) | 18/751 (2.40%) | 69.49% | 19/23 → 21/23 | 0/20 → 0/20 |
| English | 128/1433 (8.93%) | 10/1433 (0.70%) | 92.19% | 23/23 → 23/23 | 0/20 → 0/20 |

Additional frozen keyword-group accuracy is Japanese 28/32 (87.5%) → 30/32
(93.75%), English 31/31 (100%) → 31/31 (100%). Alternative spellings within one
group count once. This is lexical recognition, not a semantic intent classifier;
the original all-required-groups phrase gate remains unchanged. Missing groups
and their actual transcripts are retained in [baseline keyword details](asr-worker-final-v41-baseline/keywords.json)
and [candidate keyword details](asr-worker-final-v41-candidate/keywords.json).

Accuracy improves, but recognition becomes slower and uses more memory:

| Measure | Baseline | Candidate |
|---|---:|---:|
| Japanese median transcription | 0.938 s | 1.876 s |
| English median transcription | 0.874 s | 1.645 s |
| Worker peak RSS | 1,437,528 KiB | 12,513,568 KiB |
| First Japanese warmup | 2.561 s | 6.245 s |

Raw data: [baseline](asr-worker-final-v41-baseline/results.jsonl),
[candidate](asr-worker-final-v41-candidate/results.jsonl),
[comparison](asr-worker-v41-comparison.json).
All 140 candidate transcripts match the earlier v31 run exactly. Candidate
recognition now uses CPUs 0,2,4,6,8,10,12,14 on this host and restores affinity
before synthesis. This host-specific selection is not a global default. The
v31 candidate medians were 2.298/2.038 s; these runs occurred at different times.
Previous worker results remain under their original unversioned, v26 and v31 paths;
they are not relabeled as the new worker. Paired runs used baseline then candidate
order, not counterbalanced order.
Earlier PyAV component probes used a different resampling path and have different
error counts; they are retained in the development log, not substituted here.
Qwen 0.6B regressed Japanese critical phrases in that earlier component comparison.

### Speech synthesis: actual PipeWire playback capture

The same 20 texts per language use the same Kokoro voices and speaking rate.
The implementation raises the CPU budget from four to eight available threads
and removes only exact-zero leading padding, retaining 20 ms before the first
nonzero sample. It does not apply speed or pitch effects.

Latest paired run [v47](tts-playback-v47/README.md), using the original and current
playback implementations separately (candidate audio/speech code matches v50):

| Language | Median first sound | Improvement | P95 | Worst case |
|---|---:|---:|---:|---:|
| Japanese | 1099 → 762 ms | 30.6% | 1508 → 1027 ms | 1559 → 1294 ms |
| English | 1107 → 790 ms | 28.6% | 1624 → 1149 ms | 1724 → 1245 ms |

These times include playback into a PipeWire monitor, not acoustic sound reaching
a listener's microphone. Baseline and candidate each have 40 observations, with
zero playback errors. Worker peak RSS is 2,293,520 → 2,341,192 KiB; memory is not
improved in this run. Generation time and RTF are separate fields in the
[comparison](tts-playback-v47/comparison.json). Median generation improves in both
languages; worst English RTF slightly worsens (.250 → .255), even though its
worst audible-onset time improves.

All 80 new captures cover their prior reference waveforms, with no silent 20 ms
block replacing reference voiced audio. Six candidate source lengths differ
slightly from the earlier renders; outputs are not claimed bit-identical.
[Capture details](tts-playback-v47/capture-check.jsonl) and [raw timings](tts-playback-v47/results.jsonl)
retain every observation. New independent readback has unchanged per-case edits: Japanese 43/303 and
English 121/633 for both variants, with seven non-identical paired transcripts.
[Readback details](tts-playback-v47/readback-comparison.json) remain an ASR proxy,
not a human listening rating. The current blind page uses the newly generated
source samples.

The earlier run remains available: [timings](tts-playback-results.jsonl),
[comparison](tts-playback-comparison.json), [capture integrity](tts-capture-check.jsonl).
Its paired Whisper readback had unchanged edits for every paired case: Japanese
42/303 and English 121/633, with six differing transcripts. Those readback results
are not relabeled as measurements of the new captures. Neither run proves
naturalness or perfect intelligibility. Playback order was baseline-first, not
counterbalanced, with language warmups.

A separate worker-only run also measures total generation speed (RTF is
`generation seconds / produced audio seconds`; lower is faster). These are not
substituted for the PipeWire playback timings above:

| Language | Median generation, baseline → candidate | Median RTF | Worst RTF |
|---|---:|---:|---:|
| Japanese | 703 → 652 ms | 0.227 → 0.217 | 0.241 → 0.350 |
| English | 698 → 584 ms | 0.231 → 0.180 | 0.249 → 0.320 |

The worker-only worst generation ratio regressed despite the lower median.
The first-sound gate above uses its matched playback observations, whose P95 and
maximum both improved. [Generation measurements](tts-generation-comparison.json)
retain this separate limitation.

Blind listening page: `~/.local/share/oma/evaluation/listening-v1/index.html`.
All 80 audio elements loaded metadata in Chrome. **No human ratings have been
collected, and the agent has not claimed to hear or judge the samples.**

## Agent operations: final gates still unmet

[The complete v37 candidate](operation-diagnostics/qwen4b-final-v37/README.md)
scored Japanese 87/100 and English 88/100, with zero critical errors. Both
languages fail the 90% threshold. Successful-operation medians are 4.717/4.500 s;
failed-operation maxima are 132.974/150.940 s. All 200 observations are retained.

[The earlier rejected v28 candidate](operation-diagnostics/qwen4b-final-v28-incomplete/README.md)
completed Japanese 89/100 with zero critical errors. English stopped after 18/20;
80 unrun trials remain visible. This is not a successful bilingual matrix.
The next candidate must repeat every final slot, without carrying successes over.


The original agent baseline is now complete: **Japanese 69/100, English 78/100**.
Japanese has one critical wrong-window closure (O.M.A. ended instead of the editor).
Both languages fail acceptance. A cleanup-only microphone restoration error
stopped the initial run after 180 observations; the 20 never-run English slots
were completed with identical code and conditions. All attempted failures remain.
[Baseline results and provenance](operation-diagnostics/baseline-final-v18/README.md)
include both raw runs and the explicit completion mapping.


Each final language matrix must contain 20 tasks × 5 trials, at least 90 successes,
and zero critical wrong-window or unsaved-data losses. Actual editor contents,
files, window state, dialogs and memory are checked, not just tool names.

| Development candidate | Japanese | English | Critical failures |
|---|---:|---:|---:|
| 9B/off, v7 | 4/8 | 5/8 (one not run) | 1 unsaved draft discarded before consent |
| 4B Q8/off, separate visual grounding, v10 | 6/8 | 8/8 | 0 |
| 4B Q4/thinking on, v11 | 8/8 | 8/8 | 0 |

The v10 Japanese failures were a normal/mini mode mix-up and an incorrect sum.
The four save/discard/cancel scenarios passed across both languages. The 4B Q4
candidate with thinking enabled passed all 16 development trials. Its code and
harness were frozen for the first full final operation matrix; development
success is not presented as a final acceptance result.

The first full candidate matrix (v11) has completed Japanese at **76/100**,
with zero recorded critical errors. This **fails** the 90% threshold. English completed at **84/100**, also below threshold, with zero recorded
critical errors. The full matrix therefore fails acceptance. Six Japanese failures were unable to verify editor contents
because Qt activation did not return; those remain failures. Other failures
include changed punctuation/newlines during append, repeated tools until timeout,
ignored output constraints, and an undismissed Cancel dialog. Subsequent corrections have been measured on separate development runs below;
none has yet passed final acceptance.
[All 200 results](operation-diagnostics/qwen4b-thinking-final-v11/results.json)
and [machine summary](operation-diagnostics/qwen4b-thinking-final-v11/summary.json)
retain every failure.

After that failed final run, an expanded development set adds literal appends,
memory completion, goodbye variants and a natural-language change of mind while
closing. It still does not alter the frozen final prompts or expected results.

| Expanded development run | Japanese | English | Critical errors |
|---|---:|---:|---:|
| v12, 4B, explicit sampling and native document inspection, 13 × 2 | 20/26 | 20/26 | 0 |
| v13, 4B, append operation added, 13 × 1 | 9/13 | 11/13 | 0 |
| v13, 9B, same operation code, 13 × 1 | 9/13 | 8/13 | 0 |
| v14, 4B, native cancel, 13 × 1 | 8/13 | 12/13 | 0 |
| v15, 4B, schema guidance and bounded stream repair, 13 × 1 | 11/13 | 13/13 | 0 |
| v16, 4B, rejected crop experiment, 2 × 3 | 1/6 | 3/6 | 0 |
| v19, 4B, short window references, 13 × 1 | 8/13 | 11/13 | 0 |
| v19, 9B, identical code and sampling, 13 × 1 | 10/13 | 12/13 | 0 |

These do not meet the selection threshold. The small model still sometimes
ignores a pending dialog or supplies malformed tool arguments. The 9B comparison on the same v13 operation code also failed the development
target, with malformed tool calls and substantially longer waits. Its temporary
model selection was restored after the run. None of these development observations
are final acceptance. Both source snapshots and all raw tool traces are retained
under `operation-diagnostics`.

The important implementation and evaluation corrections are:

- Local Qwen visual coordinates are normalized 0–1000. An image-only probe
  reproduced this even when pixels were requested. The adapter converts them
  through the actual screenshot/monitor geometry. Other providers retain pixels.
- Small local models locate a named click target in a separate image-only pass.
  This pass cannot call tools; the normal fresh-frame, focus and monitor checks
  still authorize input. Its model, time, coordinates and usage are logged.
- Close-tool results distinguish a pending save dialog from successful closure.
  Closing does not authorize discarding; an explicit later choice should be
  applied without another confirmation. Cancel must dismiss the actual dialog.
- Layout restoration explicitly reports that mini/normal presentation did not
  change; model selection no longer has to infer that from a generic success.
- The component harness forwards the same computer-use visibility signal as the
  real pipeline, so the assistant does not cover a dialog under test.
- Native Save As dialogs are cancelled before their parent during cleanup.
  Content checks clear stale clipboard contents and pace modifier events.
  Failed test drafts are archived; pre-existing user documents are preserved.

Raw summaries and grounding probes are in [operation-diagnostics](operation-diagnostics).
Earlier partial final attempts remain in the [development log](development-log.md).
They exposed harness defects and are **not accepted full baseline/candidate
matrices**. Their failures are not removed or retroactively counted as successes.

## End to end: pending

The suite defines ten scenarios per language, repeated three times: new blank
and dictated documents, exact text, closing with an unsaved choice, presentation
modes, conversation logs, quoted farewells, interruption, idle exit and goodbye.
An unrelated neighbor must survive closing the editor and O.M.A. Both empty and
occupied workspaces are covered. English trials explicitly select English in
the application. The full local 60-trial matrix is still outstanding.

## Reproduction and limits

Commands and prerequisites are in the [evaluation README](../../../tests/voice/evaluation/README.md).
Every run uses a new output directory. Agent runs save source/harness hashes,
model settings, environment and all expected rows, including not-run cases.
`operations-report.py` rejects development results as final acceptance.
The optional baseline flag for continuing after loss of a disposable test draft
keeps that loss as a critical failure; unrelated-window errors always stop.

Frozen corpus hash:
`9c87e5f2d64376f58853b4b5c1ad089d96845a37ae1d574d5c696fe2062b63d9`.
Speech inputs are synthetic Kokoro recordings with two voices per language,
three rates and deterministic clean/quiet/noise conditions. They are **not human
recordings**. CER normalizes Unicode, punctuation and spacing but retains numeral
and spelling errors. Critical phrase accuracy is lexical, not a semantic judge.
Only Japanese and English have acceptance measurements; do not infer equal
accuracy in other languages. Unsupported Qwen ASR languages retain Whisper.

Hardware: i9-14900K, about 62 GiB RAM, RTX 4060 8 GiB. Model memory, process RSS,
whole-device VRAM, accuracy and latency are reported separately. Q8 and 9B
candidates partially offload to CPU on this machine; 4B Q4 fits in GPU memory.

Current production model selections have not been replaced by these development
comparisons. An isolated local plugin build supplies the test visibility bridge;
its manifest backup is `/tmp/oma-evaluation-installed-baseline-manifest.json`.
No code has been published or pushed. The goal controller still contains an older
blocked goal and rejected registration of the new one; this report does not mark
either goal as achieved.
