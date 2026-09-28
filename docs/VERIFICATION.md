# Verification

## Guided first use — September 24, 2026

- Japanese welcome, missing-dependency, AI connection, speech connection and
  voice-check screens replace the permanent SET UP/PI SETUP/RECONNECT controls.
- Pi's real authentication/settings APIs were tested with fictional credentials
  in temporary files. Existing defaults are reused; cancellation does not replace
  the default. Credentials stay in Pi storage.
- 78 Node tests, 24 QML software tests and 3 GPU tests passed before the additional
  real-SDK setup regression; the final targeted onboarding suite has 6 cases.
- Welcome screens were visually inspected at 800×900 and 420×700. The installed
  ready screen was checked on the host; the bar remained running.
- Installed IPC reported onboarding version 1 and all three preparation checks
  ready. A real user-configured AI response, TTS, generated-audio STT and PipeWire
  output completed, exposing the user-controlled start-conversation button.
- No microphone recording or new OAuth sign-in was performed by this verification.
  Users still authenticate themselves; service-specific OAuth prompts can be English.
- Model/speech configuration is not a claim of microphone acoustics being tested.


## Pi-owned model configuration — September 23, 2026

Removed O.M.A. model inputs, saved model overrides, fixed model fallback and
speech-key injection into Pi. Pi's settings/authentication are the only model
configuration source; `PI_CODING_AGENT_DIR` uses Pi's own directory convention.
The settings screen links to Pi setup and retains speech controls.

The full suite passed 73 Node tests, 23 software QML tests and 3 OpenGL tests.
Regression tests cover old overrides being ignored, missing Pi defaults requiring
setup, and a real SDK conversation using Pi's configured model. No new live cloud
conversation was run: this host has no saved Pi default. The earlier live checks
below used the previous explicit test model configuration.

## Pi migration — September 23, 2026

Verified locally with the pinned Pi SDK 0.87.1 on Omarchy 4.0.4:

- `npm ci --omit=dev --ignore-scripts --bin-links=false` completed; no symlinks
  were introduced into the plugin bundle.
- `./tests/run` passed manifest validation, runtime/shell syntax, 71 Node tests,
  23 software QML tests and 3 OpenGL QML tests.
- Settings was visually checked at 800×900 and 420×700 with fictional data.
- The real SDK against a local compatible-endpoint fixture executed tools,
  persisted/resumed sessions, received playback interruption context and forgot
  data. This fixture is not a local LLM.
- `node tests/live.mjs` passed a real Japanese Pi conversation, speech roundtrip,
  file operation, remembered-fact recall after restart, and forget/reset.
  First audio arrived after 2,718 ms in that run.
- `node tests/live_audio.mjs` passed synthetic Japanese input through STT, Pi,
  TTS and actual PipeWire playback: 2,700 ms from input completion to first
  queued audio, 4,479 ms to playback drain. These are not human microphone or
  acoustic latency measurements.
- `runtime/main.mjs` started with isolated data and wake disabled, reported
  model/voice ready and the installed Omarchy skill loaded, then exited cleanly.

The installed desktop plugin has not been replaced by this migration. Physical
microphone conversation, approval voice and camera use with the new backend
still need interactive host checks. No actual local model was available for this
pass. The following records describe the earlier backend, not Pi verification.

## Earlier publication preparation — September 23, 2026

Tested locally on Omarchy 4.0.4 with Qt 6.11.2 and Node.js 24+.

- Portable and installed Omarchy manifest validation passed.
- Node tests and runtime syntax checks passed.
- QML conversation, caption, startup/shutdown, lip timing, and settings tests passed.
- The OpenGL theme-tint test passed separately from software-rendered QML tests.
- A fictional GPU-rendered preview was generated from the current UI.

The tests exercise memory persistence and deletion, task checkpoints, bounded
context, locale instructions, interrupted responses, audio recorder handoff,
quiet speech detection, whole-line captions, key handling, desktop tool validation,
camera selection, and restart helpers. See the test output and CI for exact counts.

## Earlier host checks

During development, the following were exercised on the author's desktop:

- Opening, closing, and reopening the panel; returning from Settings.
- Reloading O.M.A. without replacing the desktop bar process.
- Shared microphone capture with a second PipeWire recorder.
- Theme changes and face tint updates.
- Fictional API conversation, Codex file operations, and persistent memory.
- Local camera enumeration and a single color-camera capture.

These are historical checks, not claims that every combination of device, accent,
model account, or Omarchy version has been tested. In particular, camera-to-model
recognition has not been verified end to end in this preparation pass.

## Limits

Physical microphone acoustics, wake pronunciation, perceived voice quality, and
lip-sync appearance require real-user testing. Wake detection currently uses a
Japanese model. The face is a shallow portrait with amplitude/spectrum-driven
mouth shapes, not phoneme-level animation.

GitHub Actions runs portable checks; it does not emulate a live Omarchy desktop.
The current preparation is a source publication, not a signed binary release or
marketplace certification. No security audit is implied.

## Guided setup verification

The setup regression tests exercise missing Node/Pi SDK dependencies before the
runtime can start. On Linux with bubblewrap available, the wizard runs with an
empty home and isolated command path, a read-only host filesystem, and fake
package-manager/tool installers. Both successful provisioning and package
installation failure are checked. These fixtures do not verify actual package
downloads, sudo authentication, or a fresh Omarchy VM. Earlier-backend real-VM
evidence is recorded in [official ISO installation verification](FRESH-INSTALL-VERIFICATION.md).
Tests skip the bubblewrap cases when user namespaces are unavailable.

The missing-dependency Settings screen is rendered with fictional data using
`demo/SetupPreview.qml -- --capture`. The QML test checks that key entry is
disabled until dependencies are available and that SET UP invokes the service.

## GPT-Live migration — 2026-09-24

- Default worker uses GPT-Live + Responses delegation; Pi is development-only.
- Offline suite: 95 Node tests, 25 QML software tests and 3 QML GPU tests passed.
- Live API: `gpt-live-1` session start and graceful close confirmed with existing
  project credentials; `gpt-5.6-luna` available to the project.
- `tests/live_gpt.mjs`: generated Japanese speech, isolated fictional SQLite
  memory, spoken reply and `remember` tool execution passed. No microphone or
  PC mutation. First PCM timing includes silence and is not audible latency.
- Actual default worker: no-microphone connection test through GPT-Live, existing
  retro processor and real PipeWire playback passed; shutdown exit code 0.
- Installed production build `61517ee707cc6628`: reports `voiceProvider:gpt-live`,
  no missing dependencies or runtime error; installed connection test passed.
- Production npm dependencies: 29 MB versus previous Pi installation 425 MB.
  This measures disk footprint, not RSS or end-to-end response speed.
- Current desktop settings screen visually checked; Omarchy bar remains mapped
  under the same shell PID. Existing QML styling remains, with one API-key setup.
- Human microphone conversation, corrections during a running PC action, and
  long-running reliability still require further real-use evaluation. No claim
  of a measured overall latency improvement from this migration.


## Native shell controls — 2026-09-24

- Settings and conversation actions use real `qs.Ui` Button/TextField/Toggle.
- GPT-Live setup shows one connection status; the unused spoken-approval control
  is hidden for GPT-Live (local approval buttons remain).
- Removed the twice-per-second `hyprctl` theme probe; the shell Color singleton
  now owns theme updates.
- Offline checks: 95 Node, 26 QML software, 3 GPU tests passed. Portable QML
  tests use explicitly labeled qs.Ui interface doubles to test application
  bindings, not the native shell components' implementation or appearance.
- Installed build `42237650eaf41fa7` uses actual shell controls. Settings and
  advanced view were visually inspected, pointer/Tab interaction exercised,
  and Escape closed the panel. No runtime error; bar retained shell PID 410369.
- Theme/face GPU test passed; existing desktop theme color remained #91ff70.


## Selectable local voice — 2026-09-26

- Settings and native desktop verified GPT-Live → Local → GPT-Live switching,
  retaining the Yamaha microphone and system Japanese language.
- Installed Whisper small, Qwen3.5 4B (Ollama/CUDA), Kokoro and pronunciation
  resources. `scripts/setup-local` completed; inference has no paid API fallback.
- Real local Japanese recognition/synthesis, Pi memory and approval tools,
  fixture-file writing, image input, memory search/forget and farewell verified.
- Virtual microphone integration exercised the real PipeWire capture → STT →
  local model → TTS → playback path. A synthetic wake phrase was detected through
  the virtual input. All temporary virtual audio nodes were removed afterward.
- Native TALKING/waveform rendering and farewell panel dismissal passed.
- `bash tests/run`: 133 Node tests, Python test, manifest/syntax checks, 34 QML
  checks and both isolated GPU fixtures passed. Shared-process GPU fixtures
  exhibited order-dependent readback; each now owns a fresh renderer.
- Perceived quality is not equated with Cedar/GPT-Live. Initial cold loading is
  slower, and small-model answer/voice quality varies. See [local voice](LOCAL-VOICE.md).

## Empty-workspace document lifecycle — 2026-09-26

- Reproduced OmaText retaining the previous file and desktop observation remapping
  the tiled O.M.A. surface as floating. Keyboard actions also checked focus before
  hiding the floating assistant, causing repeated focus errors.
- Tiled O.M.A. now remains mapped during observation; floating O.M.A. is hidden
  before input validation. Restoration tolerates a replaced compositor address.
  OMA Skill documents OmaText's Ctrl+N workflow, without inventing a file path.
- `python3 tests/live_empty_workspace.py`: real installed plugin, GPT-Live backend,
  and OmaText on initially empty workspace 98. Instructions enter through text IPC,
  not microphone recognition. Verified zero-length untitled document, no dialog,
  disjoint tiles within the display, editor-only closure, floating restoration,
  and farewell dismissal. Two successful runs: open 11.06/11.02 s, close 4.09/4.71 s,
  goodbye-to-window-disappearance 5.20/5.25 s (includes speech and closing cue).
- Inspected `/tmp/oma-empty-open.png`: blank editor on the left, O.M.A. on the right,
  both within the display. Original workspace restored after each test.
- `bash tests/run`: 184 Node tests, 39 QML checks, both GPU fixtures (3 each),
  Python/manifest/syntax checks passed. No human microphone or listening claim.
