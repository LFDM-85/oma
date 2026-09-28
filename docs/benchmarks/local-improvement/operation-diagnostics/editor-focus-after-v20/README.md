# Direct native activation recovery

Ten of ten direct trials inserted the exact requested text. Trials 3 and 7
entered the same stale Qt active=false state as the failing pre-change trial.
After 33 inactive observations, focusing O.M.A. and then the exact editor
restored native activation and allowed verified input. Both traces are retained.
The change only runs after normal activation fails, only uses the assistant
in the same workspace, and checks the document again before typing.

This is a direct operation diagnostic, not model acceptance. The 10-second
artificial delay is included in timings. A model download ran in the background
during this after-run, so no latency improvement is inferred from these timings.
The observation establishes recovery of the reproduced activation state.
