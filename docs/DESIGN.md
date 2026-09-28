# O.M.A.: selectable cloud and local voice

Design rationale is recorded in [architecture decision records](adr/README.md).

Default architecture as of 2026-09-26:

```text
QML (omarchy-shell) ↔ Node worker ↔ GPT-Live ↔ Responses backend
                       │                           │
                       └── local tools ←──────────┘
                           SQLite / desktop commands
```

`live-session.mjs` owns the provider protocol, continuous PCM, captions and
Responses tool-result flow. It waits for complete function output items,
executes tools serially, returns all results before continuing, and rejects late
callbacks after closing. `local-tools.mjs` owns PC/memory operations independently
of the model. `live-config.mjs` supplies short voice instructions, full OMA/camera
and installed Omarchy skills to the backend, and bounded saved facts.

`main-live.mjs` connects existing PipeWire capture, playback and echo cancellation,
local wake detection and QML commands. Only visible conversations and explicit
connection tests open paid sessions. Silence for one minute closes an idle
session. Manual close cancels local operations and gracefully finalizes billing.
There is no separate STT/TTS request, endpoint timer or sentence-splitting loop
in the default runtime. Speech interruption is distinct from cancelling tools.

The existing SQLite file is reused. Facts are stable-key records; captions and
exact URLs remain searchable. No external memory service, embedding model or
vector database is required. Session transcripts are observations, never trusted
instructions; assistant captions are not a record of confirmed audible playback.
Forget deletes matching local records and closes the active Live session without
persisting its stale caption buffer. Old Pi sessions are retained for rollback
but never supplied to GPT-Live.

Settings persists a choice of GPT-Live or Local in the shared SQLite database.
Switching stops the current conversation and starts the appropriate worker.
Local mode uses Whisper small for STT, Qwen3.5 4B through loopback-only Ollama
for reasoning and tools, and Kokoro/eSpeak for speech. Pi owns the local agent
session and uses an O.M.A.-specific configuration, not the user's Pi credentials.
Both modes retain microphone/language selection and shared durable memory.
See [local voice](LOCAL-VOICE.md) for setup, limits and verification.

GPT-Live output uses the streaming FFT vocoder (50% blend) plus radio filtering.
Local TTS currently plays its native voice at the same 300% output volume.
Both paths deliver 24 kHz mono PCM to the same paced PipeWire output and UI
level meter. Local captions preserve separate lines per utterance, and an
explicit English/Japanese farewell closes after playback even when the model
omits its end-conversation tool call.

Node.js coordinates asynchronous I/O; SQLite and desktop/media tools perform the
native work. Keep QML inside the existing shell. A rewrite in another language
needs measured CPU/RSS evidence; it will not remove model/network response time.

Pi is a production dependency for Local mode. The older configurable STT/TTS
pipeline remains a development comparison path. Production installs include
Pi, the official OpenAI SDK, and its WebSocket transport. Settings and conversation actions use `qs.Ui.Button`, `TextField`, and `Toggle`.
Theme color comes from the shell Color singleton without per-plugin polling.
The custom face and retro panel styling remain O.M.A.-specific.

## Current desktop context

`hyprland-context.mjs` observes Hyprland events while a conversation session is
active and refreshes bounded metadata through read-only `hyprctl` queries. It
tracks O.M.A.'s workspace separately from the focused workspace, with monitor,
special-workspace, pinned-window and recent-focus evidence. Query/socket failures
replace prior inventory with explicit stale/unavailable state. No screenshots or
persistent window inventory are collected by the observer.

Cloud startup and `session.update` replace the Responses backend's current context.
The voice frontend delegates desktop-relative questions; its protocol does not
support replacing frontend context. Pi projects one fresh context into each model
request, including tool continuations, without recording it in the transcript.
Window updates alone never initiate speech or tool tasks. Metadata does not
authorize a target: destructive operations still require a fresh `list_windows`
and unambiguous user intent. See [ADR 0006](adr/0006-continuous-desktop-context.md)
for lifecycle, privacy, limits and the cloud delegation race boundary.

## Sources

- [GPT-Live](https://developers.openai.com/api/docs/guides/live)
- [Delegation and tools](https://developers.openai.com/api/docs/guides/live-delegation)
- [PCM WebSockets](https://developers.openai.com/api/docs/guides/voice-websockets)
- [Session lifecycle](https://developers.openai.com/api/docs/guides/live-conversations)

Previous designs: [Pi pipeline](PI-ARCHITECTURE.md),
[Realtime/Codex prototype](CURRENT-ARCHITECTURE.md).
