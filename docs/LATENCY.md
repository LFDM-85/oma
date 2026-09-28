# Voice latency

The pipeline remains microphone → independent STT → Pi → streamed TTS → PipeWire.
Pi's shared model/authentication settings remain authoritative. Realtime API is
not required; command-based local STT/TTS remain supported.

## Changes (2026-09-24)

- After 300 ms of quiet, start transcription of a snapshot while waiting for the
  existing 1 second end-of-turn threshold. Display the provisional transcript.
- If speech resumes, abort and discard the snapshot. Never run Pi or its tools
  until the turn is confirmed. Failed or empty previews retry the full recording.
- At most two previews per utterance; with retries, up to three STT calls can be
  billed. Set `OMA_EARLY_TRANSCRIPTION=0` in the worker environment to disable this.
  Local command providers should tolerate cancellation and repeated invocation.
- Construct the local Pi session during recording. This does not start inference.
- The OMA skill requests a short, useful first sentence. Japanese sentence ends
  and sufficiently long opening clauses can start synthesis before the entire
  answer finishes. Do not use empty acknowledgments or claim unfinished work.
- Keep the existing Pi thinking level `off`, automatic WebSocket/SSE transport,
  streamed PCM synthesis and user's selected model. These were already enabled.

## Measurements

Opt-in, billable scripts: `node tests/bench-speech.mjs` and
`node tests/bench-latency.mjs`. They use generated Japanese speech, isolated Pi
memory, real cloud calls and no microphone/speaker. Raw samples are in
[benchmarks](benchmarks/). They are exploratory, not a statistically powered test.

Three paired trials used the same input, gpt-5.5 via Pi's shared settings, a
simulated 1 second endpoint, and alternating execution order. Both modes include
the new response instructions and session prewarming.

| Metric (ms) | Sequential samples | Overlap samples |
| --- | --- | --- |
| Recognition wait after confirmed endpoint | 797, 561, 607 | 0, 0, 0 |
| Last speech to first audio enqueue | 5165, 3589, 3430 | 3739, 2948, 4571 |

Overlap moved 701 ms of transcription work before the endpoint in all trials.
Total latency medians were 3589 ms sequential and 3739 ms overlapping: **this
small sample does not establish an overall speedup**. Model first-text time
varied from 1210 to 2946 ms and dominates much of the remaining wait. Audio
enqueue excludes actual speaker/device latency and these are not live-mic tests.

Three Japanese STT samples gave medians of 860 ms (`gpt-4o-transcribe`) and
554 ms (`gpt-4o-mini-transcribe`), but mini was slower on two of three requests.
This is insufficient accuracy/latency evidence to change the default. Three TTS
trials with the same alloy voice gave first-audio medians of 532 ms for
`gpt-4o-mini-tts` and 1188 ms for `tts-1`; keep the current TTS model and cedar
production voice. No user model preference was overwritten.

Runtime status reports `recognitionMs`, `transcriptionOverlapMs`,
`modelFirstTextMs`, `speechFirstAudioMs`, and `releaseToAudioMs` per turn.
Recognition time measures remaining wait after release, not total STT time.

## Research basis

- [OpenAI latency optimization](https://developers.openai.com/api/docs/guides/latency-optimization): overlap independent work, stream results, reduce unnecessary output.
- [Speech to text](https://developers.openai.com/api/docs/guides/speech-to-text): streaming a completed-file transcription does not itself provide live microphone transcription.
- [Text to speech](https://developers.openai.com/api/docs/guides/text-to-speech): stream PCM for low-latency playback; already used here.

A future optional streaming STT adapter can remove repeated snapshots, but making
Realtime mandatory would exclude other providers and local models. Real user
recordings, natural pauses and repeated warm-session timing should guide further
endpoint/model changes.
