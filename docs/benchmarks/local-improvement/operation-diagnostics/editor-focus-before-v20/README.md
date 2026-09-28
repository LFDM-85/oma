# Direct native activation reproduction

No model decisions. Ten attempts called the frozen v19 production document
helper with a 10-second pre-action delay and the same UI docking bridge.
Nine passed; the tenth failed with compositor focus on OmaText but native
Qt active=false throughout the wait. Its buffer remained empty and unmodified.
This reproduces the same failure seen in the 9B development dictation trial.
These direct diagnostic results do not count as agent acceptance.

The exact helper and diagnostic entrypoints are included. Both runs use
read-only native document inspection. Artificial pre-action delay is included
in seconds; this is not an agent-latency comparison.
