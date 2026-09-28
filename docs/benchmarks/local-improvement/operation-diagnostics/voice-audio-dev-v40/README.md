# English audio-input diagnostic, v40

Three development repetitions of empty-with-neighbor all passed. Each opened
an empty editor, closed only that editor, then ended O.M.A. on the goodbye;
the unrelated neighbor survived. Japanese was not enrolled in this diagnostic.
This 3/3 subset is not the required bilingual 60-trial acceptance matrix.

The temporary diagnostic build recorded only synthetic test PCM while a live
controller marker existed. Capture was disabled and the ordinary v39 build
restored afterward. Nine WAVs and all recognition responses are retained with
SHA-256 hashes; no human microphone recording was collected. All three goodbye
transcripts are `Thanks. Bye.`. The earlier v37 `Thanks.` truncation was not
reproduced, so its cause remains unresolved; it is not retroactively corrected.

This run uses cooperative recognition cancellation and ASR-only affinity to
CPUs 0,2,4,6,8,10,12,14 on this host, eight recognition threads, Qwen3-ASR 1.7B
FP32, and qwen3.5:4b low/.2/1/0. It does not isolate affinity from nondeterministic
capture differences. Source archives, configuration, environment, trial evidence,
recognition events and captured synthetic inputs accompany this report.

Full source checks passed before staging. The first preflight had failed on a
dependency symlink before any trial; dependencies and demo files were then copied
for validation without changing runtime sources. Capture uses a diagnostic-only
source and is absent from the production candidate.
