# Original agent baseline, complete matrix

Japanese: 69/100; English: 78/100. Both fail the 90% requirement.
One Japanese trial closed O.M.A. instead of the requested editor.
The legacy raw flag was false; reporting policy v2 correctly counts this as
a critical wrong-window closure without rewriting that observation.

The first run completed 180 trials, then microphone restoration failed during
cleanup. The remaining English repetition was run with identical source, harness,
model and settings. Only the 20 never-run slots were filled; no failed observation
was retried or replaced. `completion.json` records the mapping and command.

`original-run` and `supplement-run` retain raw results and traces. The frozen
harness is in `harness-v18.tar.gz`; the original agent code is in
`../../baseline-agent-source.tar.gz`, with its source hashes in this directory.
Both runs used the same staged UI/editor observation bridge as the candidate.
This is an agent component comparison, not a historical whole-UI replay.

Successful-case timing is reported separately from failed durations. It must
not be treated as latency for an identical subset of successful tasks. RSS,
Ollama model allocation and whole-device VRAM are separate in memory-summary.
