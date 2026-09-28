# GPT-Live playback jitter, 2026-09-25

The live worker used an unbuffered `pw-play` stream at 24 kHz. GPT-Live
supplied 100 ms PCM chunks with variable arrival times (up to 129 ms in the
initial probe and 197 ms in the later live check). Starting the playback
clock immediately left no reserve for late packets.

The live worker now waits 250 ms before starting the player. PCM bytes,
volume, and sample rate are unchanged. Other audio callers retain their
existing startup behavior. Explicit end-of-audio bypasses the wait, and
stop cancels pending startup before a new session can play.

## Reproduction and measurements

`node tests/bench-audio-playback.mjs 0` sends a four-second continuous tone
in 100 ms packets with two 70 ms arrival delays. A temporary PipeWire null
sink and its monitor capture the actual output without altering the default
output or using a microphone. Silence of at least 2 ms within the tone is
counted as a dropout.

- Before: 15 gaps, approximately 4.6–68.6 ms each; tone span 4127.96 ms.
- With `node tests/bench-audio-playback.mjs 250`: zero gaps; span 3999.96 ms.
- Repeated buffered run: zero gaps; span 3999.96 ms.

`node tests/live_playback.mjs` is an opt-in billed GPT-Live test that plays a
fictional Japanese sentence. It records no microphone audio and has no
personal memory or desktop tools. `OMA_TEST_OUTPUT_TARGET` can select a
null sink instead of the speaker. SHA-256 checks compare incoming PCM with
all bytes written to the player.

- The user reported that the real speaker test sounded clear.
- The initial test harness timed out while draining because late WebSocket
  events could enqueue audio after finish. The harness now stops accepting
  events before closing the connection; production session shutdown already
  rejects late events.
- Completed live check through PipeWire: 12000 ms of received PCM, maximum
  packet gap 197 ms, byte-identical output, player drained successfully.
- `bash tests/run`: 105 Node tests and 30 QML tests passed, including manifest
  validation and syntax checks. Regression cases cover buffering, unmodified
  PCM, short completed clips, and stop/restart during the startup wait.

This is a bounded jitter reserve, not a guarantee against a prolonged network
stall or sustained clock drift. The added startup delay is 250 ms per player
start, not per packet or sentence. Hardware/device failures are separate.

## Follow-up: reserve exhausted during conversation

A later report described renewed crackling, possibly after the user spoke.
There was no event trace proving whether that particular occurrence was a
model interruption or transport starvation. Inspection found that the initial
reserve was never rebuilt within a running live session.

`node tests/bench-audio-playback.mjs 250 500` introduces a 500 ms mid-stream
arrival delay, larger than the initial reserve. Before rebuffering it produced
one 308.6 ms gap followed by six additional gaps of approximately 4.8–10 ms.
After the fix it produces one 559.25 ms pause and no subsequent dropouts.
The 70 ms jitter scenario still produces no gaps.

Playback now tracks the estimated end of submitted samples. When the stream
runs dry, the next arrival starts a fresh 250 ms reserve before playback
resumes. This deliberately trades a longer recovery pause for continuous
speech afterward. No PCM is modified or discarded, and GPT-Live's response
to user speech is unchanged. Tests also cover cancellation during rebuffering.
