# Qwen3.5 4B final operations, v37

All 200 trials completed; **acceptance failed in both languages**.

| Language | Success | Critical errors | Successful median | Successful p95 | Failed maximum |
|---|---:|---:|---:|---:|---:|
| ja | 87/100 | 0 | 4.717 s | 17.818 s | 132.974 s |
| en | 88/100 | 0 | 4.500 s | 11.605 s | 150.940 s |

Model: qwen3.5:4b, thinking low, temperature 0.2, top_p 1, presence_penalty 0.
English runs explicitly select English in the application. All ordinary failures
remain in the denominator; no retry replacements. Both application language and
local model selection were restored after the complete matrix.

Japanese failures include four copy-only renames, two multiline text failures,
two replacement failures, and one each for blank, math, append, dictation and
discard. English failures are four duplicate discard confirmations, five append
errors and three replacement errors. The later rename helper and clarified
approval guidance are absent from this source.

[Acceptance and failure details](acceptance.json), [all observations](results.json),
[memory](memory-summary.json), [environment](environment.json). The trace archive
contains 454 hash-verified files, excluding private model reasoning and SQLite
memory. The source/harness archive was checked against recorded hashes.

The original baseline scored Japanese 69/100 with one critical error and English
78/100 with zero critical errors. This candidate improves success but remains
below the required 90/100 per language. Successful latency medians are slower
than the baseline 3.084/2.977 s; accuracy and speed are reported separately.

Peak sampled runner RSS: 9,107,824 KiB; whole-device VRAM: 6,866 MiB.
Ollama model allocation and VRAM allocation: 4,197,596,527 bytes.
1,247 memory samples, zero sample errors; unsampled peaks are unknown.
