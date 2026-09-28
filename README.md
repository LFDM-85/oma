# O.M.A.

**Omarchy Machine Assistant**, pronounced **OH-mah（オーマ）**.

A voice assistant for the Omarchy desktop with a theme-colored low-poly face.
GPT-Live handles spoken conversation and delegates reasoning to an OpenAI Responses
model. Alternatively, choose Local to run Whisper, Qwen3.5 and Kokoro on this
computer without API fees. O.M.A. runs PC tools and stores long-term memory
locally. Both modes use the OMA, camera and installed Omarchy skills.

![O.M.A. with a fictional conversation](preview.png)

## Install

Requires Omarchy Quattro, Node.js 24+, Python 3, PipeWire with WebRTC echo
cancellation, WirePlumber, grim, wtype, hyprctl, xdg-open and setpriv. Mouse clicks
use a small C/Wayland helper (`scripts/build-pointer`). Camera support uses FFmpeg
and v4l2-ctl. Optional local voice wake uses Vosk and a Japanese model.

```sh
omarchy plugin add https://github.com/komagata/oma --enable
```

Open Settings, install missing PC dependencies when requested, and enter an
OpenAI project API key with GPT-Live access. One key connects both voice and the
Responses backend. Select **Test voice** to hear a short test without
recording your microphone, then **Start talking**.

For local inference, choose **Voice engine → Local · Offline**, then **Set up
local models**. The first setup downloads several gigabytes and requires
x86_64 Linux, mise, a C++ build toolchain and espeak-ng. This setup was verified
with an RTX 4060 (8 GB VRAM) and 64 GB system RAM. Model loading can make the
first reply noticeably slower. Later conversations reuse the loaded models.
Local mode requires no OpenAI key and never falls back to a paid API.

Settings also includes **Microphone**, **Spoken language**, and an **OpenAI API
key** field in GPT-Live mode. Microphone selection is saved for conversation and voice wake,
without changing the system default. Use **Refresh devices** after connecting a
device. A saved API key stays hidden; enter a replacement and select
**Update key** to save it to the desktop keyring.

API usage is billed separately from ChatGPT subscriptions. Voice sessions incur
duration charges; backend usage is additional. Sessions connect when the panel
opens and close when it closes or after a minute of inactivity with no pending
work. The local wake listener does not keep a paid Live connection open.

Setup never updates the whole system or restarts the desktop shell. Production
installation uses `npm ci --omit=dev --ignore-scripts --bin-links=false`.

## Use

Open with F8, the bar icon, or optional Hey O.M.A. Speak naturally; GPT-Live manages
continuous listening and speech. Local PipeWire echo cancellation and O.M.A.'s
retro audio filter remain. Captions are model transcripts, not proof that audio
was heard. Speaking over a reply does not automatically undo or cancel PC work;
use Stop/Escape to close the session and cancel local pending operations.
Consequential actions request confirmation through local buttons. Local mode
also accepts explicit spoken yes/no answers. Local processing uses separate
recognition, reasoning and synthesis stages; interrupting it cancels its current
turn. It does not reproduce GPT-Live's full-duplex timing or Cedar voice.

Try “Remember that I prefer tiled windows”, “Open the last URL”, “What am I
holding?”, or “Thanks, bye”. Local memory tools store durable preferences, search
past captions and URLs, and forget matching records. Forget closes the active
voice session so its context cannot reintroduce removed information. External
files, old Pi sessions and backups are not erased or loaded into new Live sessions.

## Credentials and configuration

Keys are read from the O.M.A. desktop keyring, then gopass
`projects/oma/openai/api-key`, then `OPENAI_API_KEY`, then gopass
`personal/openai/api-key`. Saving in Settings writes only to the desktop keyring
over stdin. Stored secrets are never returned to QML or written to SQLite.

The standard configuration uses `gpt-live-1`, voice `cedar`, and a
`gpt-6-luna` Responses backend with reasoning effort `low`. Advanced worker environment overrides are
`OMA_LIVE_VOICE` and `OMA_BACKEND_MODEL`. Existing Pi settings/authentication are
unchanged and are no longer required by the default worker.

The local provider uses an isolated Pi configuration and sessions under
`~/.local/share/oma/local/`, with Ollama listening only on `127.0.0.1:11435`.
The selected engine, microphone, language and durable memory survive switching.
Kokoro supports Japanese, English, Chinese, Spanish, French, Hindi, Italian and
Portuguese; other installed eSpeak languages use eSpeak. Unsupported languages
report an error. See [local voice](docs/LOCAL-VOICE.md) for implementation and
verification details. The former configurable pipeline remains available for
development via `OMA_VOICE_PROVIDER=pipeline`.

## Development

`npm ci` installs development dependencies; `./tests/run` runs offline tests.
`node tests/live_gpt.mjs` is an opt-in, billable synthetic Japanese voice and
memory-tool smoke test. It uses isolated fictional memory and no microphone or
PC action. `node tests/live_local.mjs` exercises the local model, TTS, STT and
real speaker output with isolated memory and no microphone recording.
`scripts/install-local` installs a production dependency set and
reloads only the plugin; Git-managed installs use the plugin update workflow.

See [design](docs/DESIGN.md), [architecture decisions](docs/adr/README.md), and [verification](docs/VERIFICATION.md).

## Remove

Run `omarchy plugin remove io.github.komagata.oma`. Local memories remain in `~/.local/share/oma`.

### Read conversation transcripts

Setup installs the `oma` command in `~/.local/bin` (keep that directory on PATH).
For an existing installation, run `scripts/install-cli` from the plugin directory.

- `oma transcript` opens the current or most recent conversation as plain text.
- `oma transcript --today` opens today's conversations, using the local timezone.
- `oma transcript --follow` watches live captions in the terminal; Ctrl+C exits.

Opening uses `xdg-open` and your configured default text application. No specific
editor is required. Each entry includes a timestamp and `YOU` or `O.M.A.` label.
Partial captions update as recognition/generation proceeds, including cached
opening greetings. They are captions, not a word-exact record of what reached
the speaker when interrupted. Static exports do not update inside the editor;
run the command again or use `--follow` for live updates.

Transcript tables share the private memory database. Exports are private files
under `~/.local/share/oma/transcripts/` (or the configured data directory).
Forgetting matching memories also deletes matching transcript rows and removes
the generated exports. Copies you save elsewhere are independent. Old history
predating transcript sessions has no exact conversation boundaries; `--today`
includes that day's earlier saved messages, while new sessions have explicit
boundaries. Without any new sessions yet, the command shows saved history.

### Mini mode

Say “Switch to mini mode” (「ミニモードにして」) to keep only the animated face
in a small window. Say “Return to normal mode” (「ノーマルモードにもどして」)
or double-click the face to toggle between mini and normal modes. Audio and the current conversation continue uninterrupted;
approvals, questions and errors temporarily use the full interface. Presentation
mode lasts until the plugin reloads and does not change the saved transcript.

### Alongside an application

When asked to open an application, the OMA Skill identifies its window and calls
`accompany_window`. O.M.A. joins a narrow tile on its right without switching
normal/mini mode. Closing that specific window restores the saved floating
position, size and mode; changing focus does not. “Come back” (「こっちに戻って」)
uses `restore_floating` without closing the application. Idle dismissal pauses
while accompanying an application. The current implementation uses Hyprland's
dwindle layout and regular, non-fullscreen application windows.
