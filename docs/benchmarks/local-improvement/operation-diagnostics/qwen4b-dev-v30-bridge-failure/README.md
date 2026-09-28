# v30 development bridge failure

Japanese scored 0/13; English 13/13. No final acceptance is claimed. The first
Japanese blank-buffer operation created its document, then the model incorrectly
asked to accompany O.M.A. itself. The evaluation bridge forwarded this invalid
target through UI IPC, whose top-level error handler put the whole host in an
error state. Subsequent Japanese setups all failed with that retained error.
The normal production tool reports this as a tool error instead of a fatal UI
error. All contaminated observations remain failures in the raw run.

The revised bridge uses the same native target validation as production before
crossing the IPC boundary. Production also now validates before restoring an
existing layout: an invalid/self target cannot undo a valid attachment. This
change is v31, not part of these v30 observations. The queued speech comparison
refused the failed development gate and did not start. Original settings restored.
