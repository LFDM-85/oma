# Paired actual playback, v47

The original installed Audio and speech worker were compared with the candidate
Audio/worker, twenty identical texts per language. These three candidate runtime
files match v50 byte for byte. All 80 digital monitor captures completed without
playback errors. Raw PCM is retained in the private local evaluation directory
recorded by config.json; hashes permit verification. No physical microphone was
used and no listening rating is inferred.

| Language | Median before → after | Reduction | p95 before → after | Maximum before → after |
|---|---:|---:|---:|---:|
| Japanese | 1098.756 → 762.426 ms | 30.61% | 1507.702 → 1026.703 ms | 1558.911 → 1293.872 ms |
| English | 1106.720 → 790.167 ms | 28.60% | 1623.833 → 1149.454 ms | 1724.397 → 1245.260 ms |

Generation time and real-time factor are separately included in comparison.json.
Median generation is 707 → 563 ms Japanese and 698 → 558 ms English. Median RTF
is .234 → .202 and .234 → .188 respectively. Worst Japanese RTF improves
.259 → .241, but worst English RTF slightly worsens .250 → .255 (p95 .249 → .253).
Onset timing therefore must not be described as an improvement in every speed
metric. Shortening exact-zero padding also changes the RTF duration denominator.
Worker peak RSS: baseline 2,293,520 KiB, candidate 2,341,192 KiB. Thus this run does
not show a memory reduction. Audio-module and worker hashes are in provenance.

Against the earlier generated reference WAVs, all 80 captures cover the full
reference and no silent 20 ms block replaces voiced reference audio. Six candidate
source lengths differ slightly from those prior renders; these are not declared
bit-identical. Correlation and frame counts are retained in capture-check.jsonl.
Current source PCM is saved separately from captured PCM. Independent Whisper Turbo readback has now completed: Japanese 43/303 edits
for both variants, English 121/633 for both, and no case with increased edits.
Seven paired transcripts differ in wording or punctuation. Numeric transcription
conventions contribute to these edit counts; they are not a naturalness score.
Detailed listening remains separate; the blind page uses the current source
PCM, not an assumed reconstruction. Naturalness is pending human assessment.

Order was baseline-first, not counterbalanced. Warmup is excluded from per-text
onset timing. Host metadata was recorded earlier in this same evaluation session;
model/code/settings and exact audio inputs are explicitly retained. Reproduce
with playback.mjs using the frozen baseline/candidate worker and Audio paths,
then run playback-report.py and capture-check.py as documented in the suite README.
