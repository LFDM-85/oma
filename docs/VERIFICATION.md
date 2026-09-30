# Verification

The current supported implementation is GPT-Live only. Historical Local/Pi,
prototype and earlier desktop results remain in the
[pre-removal verification record](https://github.com/komagata/oma/blob/before-gpt-live-only-2026-09-29/docs/VERIFICATION.md).
They do not establish that the reduced tree has passed a new live check.

## Offline checks

```sh
npm ci --omit=dev --ignore-scripts --bin-links=false
bash tests/run
git diff --check
omarchy plugin validate .
```

The suite covers memory/transcript persistence and forgetting, credentials,
Live protocol/tool ordering/cancellation, desktop targeting, window restoration,
startup/farewell/playback, captions, language and microphone selection, wake,
face/CRT rendering, setup and packaging. Runtime entry tests use fictional keys,
isolated SQLite and blocked device/network adapters to confirm that old Local
preferences/environment cannot select a retired worker or initiate a paid session.
The real Python/NumPy FFT worker is tested with synthetic PCM, including fragmented
packets, lookahead, silence and reset. These are signal checks, not listening.

`tests/package_test.py` stages into a temporary directory with a fixture npm. It
checks the exact payload, same-hash reuse, separate dependencies for a new hash,
old-build retention and recovery from npm failure. A separate actual staged
production npm install and LiveWS/runtime import smoke are part of this migration's
record below. Neither invokes the live installer or reloads Omarchy.

Qt software fixtures render Settings at 800×900 and 420×700. They use labeled
`qs.Ui` interface doubles, so their appearance is not a native-shell visual check.
GPU fixtures remain enabled in `tests/run` when Qt is present. Setup fixtures
use bubblewrap; they skip only when user namespaces are unavailable.

## 2026-09-29 implementation-worker evidence

- Production npm installation from cache completed with the security flags above
  and `--offline`: OpenAI 7.23.0 and ws 8.21.3 only. LiveWS import succeeded.
- Real isolated package build, C pointer compilation and staged Live imports
  succeeded. Immutable-build/failure fixture and both Python FFT tests passed.
- Focused Live/startup/tools/profile suite: 44 passed, exit 0.
- Software QML: 40 passed, exit 0. Wide/narrow Settings captures were inspected.
- Manifest validation, shell syntax and `git diff --check`: exit 0.
- Full `bash tests/run` could not complete inside the worker sandbox: Node's
  `spawnSync` reports `EPERM` even for `true`; async child stdout is not delivered
  even for a child that only prints a number. Existing setup/restart subprocess
  tests fail and the owned-child termination test waits indefinitely. The run was
  interrupted (exit 130). No affected test was disabled or loosened.
- A diagnostic Node run excluding the two sandbox-hanging files completed with
  180 passes and 5 failures: four subprocess EPERM errors and transcript-follow
  output missing, consistent with the minimal stdout reproduction. This is a
  partial diagnostic, not a replacement for the full suite.
- Both OpenGL QML fixtures aborted with SIGABRT (exit 134) before running tests;
  automatic stack inspection reported `ptrace: Operation not permitted`.
  GPU success is not claimed. The coordinator must rerun the full suite and GPU
  fixtures outside the restricted implementation worker before accepting the diff.

No paid API call, user microphone capture, window action, installed-plugin update,
model download or shell restart was performed for this migration. No listening,
real cloud integration or perceived audio-quality claim follows from these checks.

## Opt-in checks

`tests/live_gpt.mjs` uses billed synthetic Japanese input and fictional memory.
`tests/live_playback.mjs`, greeting/farewell probes and other `tests/live*` files
can use a real speaker, microphone or desktop. Inspect each header and obtain the
appropriate task authorization before running them. `tests/hyprland-context-smoke.mjs`
is read-only but reflects the actual desktop. A real Omarchy session is required
for host UI and window behavior. Physical acoustics, wake pronunciation and
perceived speech quality require human verification.

## Coordinator verification, 2026-09-29

Independent review outside the implementation sandbox completed before integration:

- `bash tests/run`: exit 0; 187 Node tests, 3 Python tests, 40 software QML
  checks and both GPU fixtures (3 checks each) passed, with no Node skips.
- Clean offline production npm installation: exit 0, exactly two dependencies.
- A real isolated package build with npm, followed by staged LiveWS, live-config
  and local-tools imports: exit 0. The temporary package was removed.
- Wide/narrow Settings fixture captures inspected; these use UI doubles, not
  an installed-shell check. Manifest validation and `git diff --check` passed.
- The tagged snapshot's GitHub CI failed before this simplification: four tests
  expect a host-installed Omarchy skill, and Ubuntu's `mv` lacks
  `--update=none-fail`. These existing CI portability issues remain; local green
  tests are not a claim that GitHub CI passed. See
  [snapshot run](https://github.com/komagata/oma/actions/runs/36440900498).

The simplified changes have not been pushed or installed into the live shell.
No cloud/audio listening result is claimed.
