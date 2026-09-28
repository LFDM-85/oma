# Spoken desktop regression tests

These opt-in tests send synthesized speech through a temporary PipeWire source
into the installed O.M.A. They exercise actual recognition, agent tools, windows,
and response playback. Instructions are **not** injected as text IPC messages.
They do not replace human listening or physical microphone/noise tests.

## Matrix

Ten cases run with `gpt-live` and `local`, in Japanese and English (40 combinations):

| Case | Checks |
| --- | --- |
| `empty` | New empty document, side-by-side bounds, editor-only close, floating restoration, goodbye |
| `empty-with-neighbor` | New blank document, exact editor-only close and goodbye while a test-owned neighboring terminal remains open |
| `retained-document` | New blank document after a disposable previous file has been opened and closed |
| `document` | Exact dictated text including punctuation/spacing, unsaved dialog, spoken discard, goodbye |
| `modes` | Mini mode, reply while mini, normal mode, goodbye |
| `logs` | Actual conversation log opens in the default editor, alignment, closes without ending O.M.A. |
| `quoted-goodbye` | Translation of a farewell keeps the conversation alive; a real farewell closes it |
| `interruption` | Interrupt spoken counting with a different question and receive the new answer |
| `farewell` | Direct spoken goodbye closes O.M.A. without another application |
| `idle` | No speech produces no user transcript; opening, idle prompt, farewell, automatic dismissal |

Local tests require the installed local STT/agent/TTS models. They assert the
agent provider is `oma-local` and never switch to cloud inference to pass.
Every case explicitly sets the app's `Response language` to `Japanese` or
`English`, waits for the setting to take effect, and asserts it before opening
the conversation. Selecting English audio fixtures alone is not sufficient.
Fixture synthesis is a separate OpenAI TTS preparation step; cached fixtures can
be reused for local testing. No test claims all possible commands are covered. Each case must satisfy the same
observable postconditions in both languages and both providers; recognition
alone or a spoken claim of success is not a pass.

See [recorded live results](../../docs/VOICE-TEST-RESULTS.md) for current failures
and verification limits.

## Run

Close O.M.A. and OmaText, save any work in OmaText, and leave workspace 98 empty.
OmaText must be installed and configured as the default text editor for `logs`.
Editor cases reset the closed, unmodified OmaText plugin before starting. The
retained-document case then seeds its own disposable previous file, so provider
and language comparisons do not depend on which case ran earlier.
The test uses keyboard/mouse input on that workspace. Switching workspaces stops
input immediately rather than continuing on your working desktop.

```sh
node scripts/prepare-voice-tests.mjs /tmp/oma-voice-fixtures/ja ja
node scripts/prepare-voice-tests.mjs /tmp/oma-voice-fixtures/en en
python3 tests/voice/run.py --fixtures /tmp/oma-voice-fixtures
```

TTS preparation and GPT-Live cases incur normal API usage. The ordinary
`bash tests/run` runs only offline tests, including geometry/test-control checks.

Run a subset while diagnosing a regression:

```sh
python3 tests/voice/run.py --providers local --languages en --cases empty modes
python3 tests/voice/run.py --providers gpt-live --languages ja --cases document
```

`--workspace`, `--artifacts`, and `--keep-going` are available. A failed case
remains a failure; there are no automatic retries that turn it green. Setup
preconditions and timeouts also fail explicitly. A cleanup failure stops the
matrix even with `--keep-going`; remaining cases stay `not_run`.

## Evidence and cleanup

Every invocation gets a dated subdirectory under `/tmp/oma-voice-results`; its
`results.json` and evidence never overwrite an earlier run. The path is printed
at startup. Each provider/language/case
has recognized user speech, assistant text, backend transitions, elapsed checks,
and document screenshots when appropriate. These are local, private artifacts;
log-viewer contents are not copied into screenshots by the harness. Local agent
termination reasons and token usage are included without copying private reasoning.
`not_run`, setup failures and cleanup failures are distinct from successful cases.

The harness restores response language, provider, microphone selection, original
workspace and clipboard, and unloads temporary audio nodes. Test-owned unnamed documents are archived in
`test-document.txt` on failure, then reset by reloading OmaText for the next case.
If the document is named or cannot be archived safely, it remains on the test
workspace for inspection; save/discard it before rerunning. Other application
windows are never cleanup targets.

## Extending coverage

Add the spoken prompt to both languages in `phrases.json`, add a scenario with
observable postconditions in `run.py`, and include its name in `SCENARIOS`.
The provider/language matrix then runs it automatically. Preserve exact text
checks for dictation and explicit window identities for desktop operations.
Do not treat a spoken claim of success as evidence that a tool ran.

The matrix currently covers these ten conversation/desktop flows. Camera use,
physical wake-word detection, noisy rooms, approval dialogs and saving through a
file chooser remain outside this matrix; existing component tests cover parts
of those paths. Physical microphone and perceived audio quality need separate
listening checks.

To isolate new-document switching from speech and model decisions, close both
applications and run `node tests/live_new_document.mjs`. It opens a disposable
previous file and O.M.A. on workspace 98, invokes the same skill operation as the
agent, and verifies an empty unsaved buffer. Opening the panel still starts the
selected voice provider and microphone; `silent` only suppresses the opening
sound. This is not an offline test.

For a focused, fully local recognition check (no playback or desktop input):

```sh
~/.local/share/oma/local/venv/bin/python tests/local_asr_smoke.py
```

It uses the installed Whisper model and cached Japanese/English close-request
WAVs to check the OmaText name, plus deterministic silence and quiet-noise inputs
to ensure the contextual prompt is not emitted as invented speech. It does not
prove recognition accuracy for other utterances or physical microphone noise.

For the fixed local-model evaluation corpus and repeated acceptance runs, see
[evaluation/README.md](evaluation/README.md). `--repeat 3` retains all three
observations separately; failures are never replaced by successful retries.
