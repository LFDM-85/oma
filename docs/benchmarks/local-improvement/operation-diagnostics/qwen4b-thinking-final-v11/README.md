# First complete candidate operation matrix (v11)

200 final trials: Japanese 76/100, English 84/100, zero recorded critical errors.
Both languages fail the 90% acceptance threshold. No failures were removed.
This uses clipboard content verification and the original temperature 0.2;
subsequent inspection/sampling/code changes are not part of these results.

`stdout.jsonl` files retain tool requests, results and final responses. Private
model reasoning and session databases are not included in this report export.
`source-and-harness.tar.gz` retains the exact runtime, skills and harness used.
It requires the recorded Node dependencies and compatible installed UI.
`memory-summary.json` reports RAM, estimated model GPU allocation and whole-device
GPU memory separately. Sampling began after the first case, so cold-load memory
is not inferred.

The per-language raw traces are losslessly packed in `traces.tar.gz`;
`trace-hashes.json` preserves each original path and SHA-256. Extract into a
separate directory to inspect individual observations. This keeps the plugin
source below its existing file-count safety limit without dropping results.
