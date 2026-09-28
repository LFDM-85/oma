# Local voice implementation

Settings and the worker select the persisted engine; GPT-Live remains the
default. The local models and runtime are installed on the development desktop.

The implementation must provide two persisted choices: GPT-Live and Local.
Local mode must never fall back to a paid API. Model downloads are a separate,
explicit setup operation; conversation inference runs offline.

## Engines

- STT: faster-whisper small, CPU int8, persistent worker.
- Agent: Qwen3.5 4B through a private Ollama endpoint on 127.0.0.1:11435,
  integrated with the existing Pi agent, tools, skills, and SQLite memory.
  The Ollama context and Pi model declaration both use 32,768 tokens. Pi reserves
  answer space when constructing requests; the former 16,384-token declaration
  could reduce a resumed desktop conversation to a one-token output budget.
  A closed local conversation releases its Pi session. Reopening creates a new
  working context; durable memory and archived conversation logs remain available
  through the memory tools, rather than replaying every previous desktop action.
- TTS: Kokoro 82M on CPU for Japanese, English, Chinese, Spanish, French,
  Hindi, Italian, and Portuguese. Other supported languages use local eSpeak.
- Audio remains 24 kHz mono PCM at the app boundary. Whisper receives
  resampled 16 kHz PCM. TTS emits sentence chunks without a whole-reply wait.

The local TTS voice differs from Cedar. Existing output effects can be applied
after synthesis. Model quality and turn-taking are not equivalent to GPT-Live's
full-duplex model and require actual interaction checks.

## Supported behavior

- Settings can install local components, show progress/errors, and switch both
  ways without an OpenAI key or changes to the user's global Pi configuration.
- Restart preserves the choice, language, microphone, and shared memory.
- Local mode performs real Japanese STT, agent response, and TTS without cloud
  credentials or inference network access.
- Tools, approval/denial, image inspection, memory lookup/forget, greetings,
  farewell dismissal, cancellation, and wake activation work in both modes.
- Captions, levels, waveform, and speaking state follow actual playback.
- Live desktop verification covers Settings and a spoken conversation; unit
  tests and PCM checks alone do not establish perceived voice quality.

## Development environment

Local files are isolated under `~/.local/share/oma/local/`. Python 3.12.14 is
installed through mise without changing the user's active Python. Torch uses
the CPU wheel, preserving GPU memory for Qwen. Ollama 0.34.4 is unpacked in
that directory and runs as the transient user unit `oma-local-ollama.service`
with `OLLAMA_NO_CLOUD=1`. Reproducible setup and lifecycle management
are implemented in `scripts/setup-local` and `runtime/local-runtime.mjs` and were exercised on the development desktop.

## Verification — 2026-09-26

- Real Whisper transcription of the Japanese Cedar reference clip.
- Real Kokoro English and Japanese synthesis, with generated Japanese speech
  successfully transcribed by Whisper.
- Qwen replied in Japanese and called Pi's `remember` tool, persisting the
  requested fact in an isolated database. Initial model loading/JIT took about
  59 seconds; the subsequent tool turn completed in about four seconds.
- `node tests/live_local.mjs` passed using a fresh database, actual local
  model, TTS, STT, PipeWire playback, and clean worker shutdown.
- Settings fixture covers both engine selections and hides the cloud API key
  in Local mode. Native desktop selection into Local and its voice test passed;
  the saved Yamaha microphone and system Japanese language were retained.
- All 133 Node tests and 34 software-rendered QML tests passed.
- Native selection back to GPT-Live restored ready/idle state without errors.
  The current desktop selection is GPT-Live.

- Real Qwen tool checks passed for approval/denial, writing a fixture file,
  inspecting a synthetic red image, remembering/searching/forgetting a fact,
  and calling `end_conversation`. Fixture files and memory were isolated.
- A virtual PipeWire microphone carried Japanese audio through the actual
  capture, STT, model and TTS path, and real output playback completed.
- A synthetic wake phrase was detected through a virtual PipeWire microphone.
- Native desktop playback showed TALKING and a nonzero animated waveform.
  A direct farewell closed the actual panel after speech playback.
- Interruptions reject late text/audio in controller and local worker tests.
  The production worker shuts down cleanly after the integration test.

These are functional checks, not a claim that the local voice sounds identical
or as natural as Cedar. Kokoro pronunciation and small-model answers can differ.
The first cold model load/JIT can take about a minute on the tested computer;
subsequent tested short turns were substantially faster. No runtime cloud
speech or model fallback exists; explicit web/PC tools may still access the
network when a user task requires it.

Full `bash tests/run` passed: 133 Node tests, the Python language-selection
check, manifest/syntax validation, 34 software-rendered QML checks, and both
GPU fixtures. GPU fixtures run in separate processes: combining CRT and Canvas
fixtures in one offscreen renderer produced order-dependent texture readback.
The theme-color test passed independently against both the previous installed
build and the current source. No production face-rendering change was needed.

Final installed runtime build: `57fe4b111073b06c`. Desktop status is GPT-Live,
ready/idle with no error, and Settings remains open for switching to Local.

## GPT-Live startup greeting cache — 2026-09-26

GPT-Live prepares a short greeting in the background for the resolved response
locale. Each language/voice/effect revision has a separate private cache under
`~/.local/share/oma/greetings`. Preparation makes a one-time billed Live request
for a missing entry, using only greeting instructions and silent input, never
microphone audio or saved conversation. Changing language prepares that variant.
An unknown system locale or unavailable cache retains the ordinary live greeting.
Local-engine greetings are unchanged.

Cached PCM already includes the streaming vocoder and radio effect. It is played
through the normal Audio output and waveform path while the connection starts;
it is not processed a second time. Microphone input captured during startup is
held until both the connection and clip playback are ready (bounded to the most
recent 15 seconds). Closing discards this queue. Language/voice/effect changes
invalidate the entry. A failed preparation does not block the live conversation.

`node tests/bench-greeting.mjs` is an opt-in billed comparison through actual
PipeWire output. One trial measured 2413 ms to the first playback-level callback
for a freshly connected live greeting and 13 ms for the cached clip. These are
application callback timings, not acoustic loopback or statistical averages.
`node tests/live_cached_greeting.mjs` exercises the full worker with an isolated
history database, actual microphone and the cached greeting.

The opening cue now finishes before cached speech begins. Its `pw-play` close
signal gates speech (rather than a fixed delay); connection preparation runs in
parallel. Closing invalidates pending speech. The full-worker check with the
1.23-second cue measured first speech at 1270 ms with no error. The earlier
82/13 ms checks omitted this intentional cue-first ordering. All 141 Node tests
passed after adding cue-drain and cancellation regression coverage.

## Inactivity notices — 2026-09-26

GPT-Live now uses two 10-second waits rather than its former 60-second silent
close. New nonempty user transcripts reset the wait; microphone RMS and filtered
annotation tags do not. Assistant voice playback updates the last-active time;
connection preparation, approval and backend/tool work pause the countdown.
After the prompt finishes, another 10 seconds without a transcribed reply asks
for a localized farewell. The panel closes only after audible farewell output
and a 1.5-second drain margin. Missing notice audio retries rather than silently
closing. A user reply cancels the pending dismissal. Local's existing notice
controller defaults were also changed from 15/20 seconds to 10/10 seconds.

`node tests/live_idle.mjs` verified the real GPT-Live flow with synthetic silent
input and a temporary PipeWire output sink, without physical microphone input.
Prompt requested at 10014 ms; farewell at 24224 ms; closed at 29941 ms after
playback. Both notices were spoken in Japanese. Full checks passed: 145 Node
tests, Python and QML suites. These timings include generation and speech, so
two 10-second waits do not imply the panel closes 20 seconds after opening.

## Farewell-to-close latency — 2026-09-26

Prepared GPT-Live sessions use a localized cached farewell as well as a cached
opening. Voice and backend instructions give the application ownership of the
farewell, avoiding a second model-spoken goodbye. `end_conversation` disconnects
the live audio stream while the saved farewell plays. The Audio player drain
callback dismisses the panel immediately; neither a quiet-period heuristic nor
server-close acknowledgement gates the closing cue. Manual Stop cancels pending
dismissal. Session configuration snapshots availability so preparing a clip
mid-session cannot unexpectedly duplicate a model-owned farewell.

Clips are keyed independently by locale, voice, instruction and effect revision
under `farewells/`. Missing clips are prepared alongside opening clips; sessions
without a prepared clip retain the live fallback. The cached farewell is also
used after the second inactivity interval. The OMA skill explains ownership.

`node tests/bench-farewell-gap.mjs` plays the real Japanese cached farewell and
closing cue into a temporary PipeWire sink, captures its monitor, and locates
both signals by waveform correlation. The measured acoustic-data gap was 83.5 ms
in one trial. This includes separate player startup/drain, but excludes QML IPC
scheduling and physical hardware latency; it is not a subjective listening test.

Native verification: the first reload attempt still ran the older `82f1a7f0d8ab4f6e`
worker despite an updated manifest. Disabling the plugin, rescanning, waiting two
seconds, then enabling it loaded the expected `8fe5d7c0a1146ff2` runtime (verified
via the running Node process command line). Sending the Japanese farewell then
used exactly one cached farewell caption and closed without an error. Polling
native playback level and panel state measured 410 ms from the last observed
voice level to closing, versus approximately 2.9 seconds with the stale runtime.
This UI polling metric is distinct from the 83.5 ms loopback waveform gap.
All 160 Node tests and the complete Python/QML checks passed.

## Multilingual default policy

The default conversation model is the upstream Qwen3.5 4B, not a Japanese-only
or Japanese-specialized derivative. Keep a general multilingual model as the
shipped default. The response language follows the user's setting or OS locale,
not a hard-coded Japanese prompt. Whisper small is the multilingual variant.
Kokoro voices are selected per language; other supported eSpeak languages use
the offline fallback. Coverage and quality differ by language, so this is not
a claim of equal speech quality across every language.

Model reference: https://huggingface.co/Qwen/Qwen3.5-4B

Local Pi action turns use temperature 0.2 to reduce variation in tool selection.
This has a real-SDK request regression; it does not guarantee correct actions or
exact dictated text. See `VOICE-TEST-RESULTS.md` for remaining live failures.
