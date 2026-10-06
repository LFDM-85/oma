# O.M.A. with Dobby

This fork can send conversations to an existing Dobby service. Dobby keeps its
configured model connections, tools, permissions and confirmation gates. O.M.A.
uses local Voxtype recognition and Dobby's Piper voice, with the original O.M.A.
FFT vocoder and radio filter enabled by default. This retains O.M.A.'s robotic
effect; it does not reproduce the cloud Cedar voice.

## Requirements

- A working [Dobby installation](https://github.com/LFDM-85/DOBBY) and daemon.
- Dobby's local Voxtype model and Piper voice, checked with `dobby doctor`.
- Node.js 24+, Python with NumPy, and PipeWire recording/playback.
- `pactl` and PipeWire's WebRTC echo cancellation library for interruptions.
- Omarchy and the regular O.M.A. plugin UI.

The backend discovers Dobby's source modules from the resolved `dobby` launcher.
It uses Dobby's local Python runtime when available, otherwise `python3`.
Nonstandard installations can set `OMA_DOBBY_ROOT` and `OMA_DOBBY_PYTHON` in the
desktop session environment. No API keys are copied into this repository.

## Select the backend

Install this fork:

```sh
omarchy plugin add https://github.com/LFDM-85/oma --enable
```

Set `~/.config/oma/backend.json` to:

```json
{"backend": "dobby"}
```

Reload O.M.A. after selecting a backend. QML changes may require
`omarchy restart shell` to clear cached UI components. This restarts the desktop
shell, not Dobby's daemon.

Open O.M.A.'s Settings and select **Test voice**. This asks Dobby for a short
response and plays it locally; it does not record the microphone. Dobby may use
its configured cloud model connection for the response. Opening the conversation
starts local microphone capture. Spoken language and Piper voice follow Dobby's
settings; the microphone and voice effects controls remain in O.M.A.

To use GPT-Live again, choose `{"backend": "gpt-live"}` or remove the backend
selection file. GPT-Live retains its own OpenAI API key and billing requirements.
`OMA_BACKEND=dobby` or `OMA_BACKEND=gpt-live` overrides the file.

## Request ownership

Every request uses its own request ID and a persistent O.M.A. session ID. Replies
are requested with `silent=true`: O.M.A. handles speech playback. The bridge
refuses a new request while Dobby has pending work. Confirmation and Stop are
scoped to O.M.A.'s active request, so they cannot approve or cancel another
client's work. Closing the panel stops its audio and cancels only work it owns.

Local captions remain available through `oma transcript`. Dobby continues to
manage its own conversation and task records. The original GPT-Live desktop and
camera tools are used only in GPT-Live mode; Dobby mode uses Dobby's tool set.

## Daily autonomous work

The Dobby backend can prepare one private daily report from active goals,
stability observations and estimated AI costs. O.M.A.'s AUTO strip offers
Prepare/Report and Pause/Resume; maintenance proposals still show Approve/Dismiss.
Reports contain unverified drafts and success measures, not claims of completed
work or earned income. The analyst has no execution tools and does not trade,
publish or message people. Current market data and an investment risk profile
are required for later financial research. The existing configured native
provider login is used, without changing O.M.A.'s GPT-Live credentials.

The same controls are available as `dobby autonomy status|run|report|pause|resume`.
`dobby autonomy focus "..."` sets the user's skills, priorities and constraints.
Attempts are limited to once per day, including failed or interrupted attempts.

## Development

The adaptation branch is `feat/dobby-integration`; the same changes are included
on `main`. The `upstream` remote points to `komagata/oma`.

```sh
npm ci --omit=dev --ignore-scripts --bin-links=false
bash tests/run
```

The offline adapter tests cover request ownership, concurrent acceptance and
cancellation, confirmation isolation, wire size limits, original vocoder output,
and preserving the full speech tail. Live checks require a running Dobby and
audio devices.

## Conversation and interruptions

Type in the message box and press **Enter** or **Send** to use the same
conversation as voice. **Shift+Enter** adds a new line. Written corrections can
interrupt an active request too. Unsent drafts remain when the panel is closed;
the editor clears only after acceptance, and keeps any newer draft you started.

The voice assistant introduces itself as **O.M.A.**. Its name and conversation
instructions are scoped to its own requests; the Dobby CLI keeps its identity.
While the panel is open, microphone capture continues during planning and speech.
PipeWire's [WebRTC echo canceller](https://docs.pipewire.org/page_module_echo_cancel.html) pairs O.M.A.'s playback with its microphone so
its own voice is removed from the captured signal. Only this client's audio is
routed through the temporary module; system defaults are left alone.

After sustained speech begins, O.M.A. stops its playback and cancels only its own
active request. It waits for the worker to stop, then sends the correction with
the original intent, earlier additions and the last action checkpoint. Conflicting
instructions require a clarification before further tools. Recognition keeps
running during transcription, and utterances are combined in their spoken order.
The recognizer follows Dobby's input language independently of the reply language.

Cancellation does not undo actions already dispatched. The continuation must
check their current state before repeating anything. Closing the panel stops
capture and cancels owned work. A 350 ms silent lead-in lets the output device
start before the first word; the speech samples themselves are preserved.
