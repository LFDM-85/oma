# v43 voice development: cleanup failure retained

Japanese four scenarios passed. The English document scenario completed its
operation assertions, but failed microphone/device cleanup. Its result remains
`cleanup_failed`, not passed; three remaining English slots are `not_run`.
The original results and all trial traces are archived unchanged.

`pactl unload-module 536870918` timed out after 20 seconds. Both `pw-dump` and
`pactl info` also stalled while an old O.M.A. playback child remained alive after
stop. PipeWire recovered after the test restored the ordinary GPT-Live worker;
no host audio service was restarted. The two remaining test-owned virtual Pulse
modules were identified and removed. Physical default devices were unchanged.

A lifecycle race was found: playback and echo-module child termination had been
requested but not awaited before recreating the same node names. v46 waits for
owned child closure, escalating after 300 ms if necessary. Deterministic process
and ordering tests failed before the change and pass afterward. A separate live
silent test rebuilt the audio path 12 times, checked each process and node was
gone, and verified unchanged defaults. This supports the lifecycle fix but does
not yet establish that it was the sole cause of this host stall. Full application
voice verification remains separate.
