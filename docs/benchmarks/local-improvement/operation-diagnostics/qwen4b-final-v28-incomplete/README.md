# v28 rejected final candidate: incomplete bilingual matrix

Japanese completed 100/100 trials: 89 successes, 11 failures, zero critical errors.
This misses the required 90 successes. English completed one repetition: 18/20
successes, two failures, zero critical errors; the remaining 80 are not_run.
English is not a final acceptance result and cannot be compared as a complete
matrix against the 100-trial baseline.

The run was stopped with SIGINT only after the first English repetition, because
the Japanese gate had already failed and a revised implementation was prepared.
All failures and unrun slots remain in results.json. No successes will be carried
into the next candidate; it must run all 200 slots again. The selection wrapper
restored prior settings, and the following automatic voice job refused this
incomplete matrix and did not start. No system-wide audio restart was performed.

The source and harness are frozen v27, using Qwen3.5:4b, thinking low,
temperature 0.2, top_p 1, presence penalty 0. Source/harness archives, raw traces,
model/environment settings, sampled memory, stop reason and gate report are
included. The newer farewell route and recognition preloading are not part of
these observations.
