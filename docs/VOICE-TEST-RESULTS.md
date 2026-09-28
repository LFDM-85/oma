# Spoken regression results — 2026-09-26

The Japanese/English × GPT-Live/local matrix is implemented in
[the voice test harness](../tests/voice/README.md). Synthetic WAV speech was sent
through a temporary microphone source into the installed O.M.A., exercising
recognition, agent tools and actual desktop windows. This is not a physical
microphone or human listening assessment.

## Funded GPT-Live recheck at 21:11 JST

After the user added API credit, GPT-Live connected successfully. The run
`/tmp/oma-live-funded/20260926-211108-3762128` completed six spoken cases with
five passes and one failure, using the existing installed build:

- Japanese and English empty-document and retained-document cases all passed:
  new blank buffer, side-by-side layout, editor-only close, floating restoration
  and goodbye.
- English exact dictation passed, followed by the unsaved dialog, spoken discard,
  editor closure and goodbye. The editor-close check after discard took 12.24s.
- Japanese dictation failed: recognized speech included “蝶” instead of “今日”,
  and document contents were `こんにちは、蝶の天気は雨です`. The expected text
  remains `こんにちは　今日の天気は雨です。`. This failure is not waived.

The credit blocker is resolved. Complete Japanese/English and provider parity
is still not established; the local dictation failures below also remain.

A targeted Japanese follow-up continued through close/discard even when exact
dictation failed, without changing the expected text or treating a retry as a
pass (`/tmp/oma-live-ja-close-followup/20260926-211540-3800486`). It reached the
unsaved dialog, recognized both the close and explicit discard requests, but
timed out waiting for the editor to close. The backend trace shows the original
close tool and its completion, but no subsequent tool for discard. The assistant
asked whether to save after the user had already said to discard. This narrows
the remaining close failure to handling a follow-up during the pending close
operation, rather than proving a compositor/window-close failure. This case is
still unresolved; the successful English flow does not establish Japanese parity.

## Status before credit was added (20:14 JST)

Installed build: `4349f28fea7dfbad`. The latest local spoken run,
`/tmp/oma-context-focus-final/20260926-194630-3598836`, passed retained-file →
new empty document → editor close → goodbye in both Japanese and English.
Exact dictation still failed: Japanese included extra/misinterpreted text;
English stopped after creating an empty document. General parity is not achieved.

The subsequent local run at
`/tmp/oma-local-behavior-final/20260926-200340-3650244` passed all eight cases:
mini/normal mode with a reply in mini mode, opening/closing conversation logs,
translating a quoted farewell without ending the conversation, and interrupting
spoken counting with a new question, each in Japanese and English. Every case
also completed a real goodbye. This is one successful run per combination,
not a reliability guarantee. Goodbye dismissal checks took about 4.6–17.9 seconds
after recognition; these intervals include response/playback, not just silent
time after speech. Performance remains a separate concern.

The shared window implementation now waits for an in-flight companion poll,
rejects unknown close targets, and activates OmaText's native editor before a
new-document shortcut. The execution/voice prompt roles are separated. Local
Whisper Small now receives short application context and uses beam size 5.
The real-model ASR smoke test passed both language/name checks and four
silence/quiet-noise checks. Neither Qwen 9B nor Whisper Turbo was adopted.

GPT-Live was rechecked at 20:14 JST in
`/tmp/oma-goal-blocker-audit/20260926-201429-3682792`; session
startup still failed with the API's no-credits error. Its latest fixes remain
unverified end to end. No billing/account changes were made. Runtime settings
were restored to GPT-Live, automatic locale, Yamaha input, normal view and
workspace 2, with the panel closed.

## Earlier observed results

These are observations from several development runs, not a claim of stable
provider parity. Each cell records a completed case; a pass does not establish
reliability across repeated runs. Earlier runs used less strict opening/interrupt
checks; the latest harness waits for the greeting to finish and verifies actual
counting before interruption.

| Case | GPT-Live Japanese | GPT-Live English | Local Japanese | Local English |
| --- | --- | --- | --- | --- |
| Empty document → close → goodbye | Fail | Pass | Fail | Fail |
| Dictation → discard → goodbye | Fail | Fail | Fail | Fail |
| New document after a retained file | Pass | Fail | Fail | Fail |
| Mini mode → reply → normal mode | Pass | Pass | Fail | Fail |
| Conversation logs → close | Pass | Pass | Fail | Fail |
| Quoted farewell → follow-up question | Pass | Pass | Fail | Fail |
| Interrupt counting with a question | Pass | Pass | Fail | Fail |
| Silence → prompt → automatic goodbye | Pass | Pass | Pass | Pass |
| Direct goodbye | Pass | Pass | Pass | Pass |

## Failures to investigate

- GPT-Live Japanese correctly created and typed `こんにちは　今日の天気は雨です。`
  in an untitled document, but acknowledged the close request without performing
  the operation. The test failed waiting for the unsaved-document dialog. The
  empty-document case also failed waiting for the editor to close.
- GPT-Live English typed `Hello. It is raining today.` exactly after explicit
  capitalization instructions, but also failed waiting for the unsaved-document
  dialog after the close request.
- GPT-Live English sometimes retained the previous document rather than creating
  a new untitled document. The retained-document fixture reproduces this using a
  disposable test file, independent of personal files or prior test order.
- Local speech recognition produced the expected requests in both languages, but
  ordinary agent actions/replies did not follow. Sampled Qwen3.5:4b sessions ended
  with `stopReason: "length"` and no usable assistant content/tool call. This
  narrows investigation to the agent path; it does not establish the underlying
  cause. Direct goodbye and idle handling passed. No cloud fallback was used.

Failures remain recorded; the harness does not retry until green. An early
English mode test falsely rejected capitalized “Two.”; its case-insensitive
assertion was corrected and the case rerun. The English dictation fixture was
also clarified to explicitly request initial capitals, rather than assuming
speech alone specifies capitalization.

## Evidence and scope

Local private artifacts (not committed) contain per-case transcripts, timings,
backend states, failure reasons and test-owned document snapshots:

- `/tmp/oma-voice-final-matrix`: normalized editor setup, retained-document,
  dictation and direct goodbye, all four provider/language pairs.
- `/tmp/oma-voice-matrix`: Japanese conversation cases; English logs and quoted farewell.
- `/tmp/oma-voice-completion-en`: corrected English mode check, interruption and idle.
- `/tmp/oma-voice-local`: local conversation cases in both languages.
- `/tmp/oma-voice-capitalization-check`: explicit-capitalization English dictation.

Some earlier attempts also failed with retained personal log documents; those
observations led to isolated initial editor state and a dedicated retained-file
case. Their results are not substituted for the normalized editor cases above.

The matrix contains nine flows, 36 combinations. It does not cover all possible
commands, noisy physical microphones, wake-word reliability, camera use, approval
dialogs or file-chooser saves. Successful text/level checks do not establish
perceived audio quality. The harness restores provider, language, microphone and
workspace settings, and removes its temporary audio nodes after each run.

## Repair investigation

The initial local failure was reproduced without microphone input: the same
short question succeeded with a fresh context but ended after one token with the
saved desktop history. Capturing Pi's outgoing payload showed `max_tokens: 1`.
Its context-budget calculation had exhausted the declared 16,384-token window.
Increasing the declared capacity to 32,768 restored `max_tokens: 2048` and a
complete answer for the same history. Ollama's loaded context was also verified
as 32,768; the declaration and server configuration now match.

Local sessions now release working context when the panel closes and create a
fresh context when reopened, retaining durable facts and archived transcripts.
This prevents old desktop tool output from accumulating across conversations.
Length-limited replies raise an explicit error instead of marking the operation
completed. The real Pi SDK regression verifies local isolation and retained
memory while preserving the separate pipeline provider's session resumption.

The first GPT-Live delegation-policy revision reached the unsaved-document dialog
in Japanese but lost the spoken discard follow-up. The next revision separates
the short voice routing policy from backend procedures and explicitly relays
corrections and dialog answers. See the official
[GPT-Live prompting guide](https://developers.openai.com/api/docs/guides/live-prompting#delegation)
for this separation. Its live verification remains pending: on 2026-09-26 at
18:18 JST the API rejected new sessions with “You have no credits remaining.”
No credits were purchased or account settings changed.

Intermediate diagnostic runs are preserved under `/tmp/oma-fix-voice` and
`/tmp/oma-fix-voice-v2`. They were deliberately stopped to deploy subsequent
changes, so unrun combinations in those directories are not passes. The latest
run is under `/tmp/oma-fix-voice-v3`; its GPT-Live failures are billing failures,
not evidence that the latest routing policy succeeded or failed behaviorally.

A separate native regression now isolates the new-document action from model
inference: `node tests/live_new_document.mjs`. With the assistant visible,
back-to-back modifier/key events sometimes left OmaText's previous document
unchanged. The desktop keyboard tool now separates modifier press, key and
modifier release by 100 ms. The same native new-document probe passed three
consecutive runs after the change. A trial change to OmaText's shortcut context
did not help and was fully reverted in both its checkout and installed plugin.

The shared `new_text_document` operation lives in the OMA skill's scripts. It
checks for existing unsaved work/dialogs, creates and verifies an empty buffer,
and only then types. Both providers expose it, and `list_windows` supplies exact
window identities without requiring the model to construct a shell pipeline.
The installer includes the skill's executable resources. Local dictation still
requires further model-quality verification: the 4B model sometimes included
formatting instructions in the document or interpreted punctuation incorrectly.
An isolated 9B comparison also produced incorrect spaces and an extra newline
in the Japanese document text (15.3 seconds for the first tool response). It did
not execute desktop tools and does not establish end-to-end success. The default
remains the 4B model; increasing model size alone did not resolve this case.

### Follow-up at 19:02 JST

The local Japanese `empty` and `modes` flows passed end to end on build
`575a609d5605c56e`. The retained-file case still failed: compositor focus had
changed but OmaText reported its native window inactive. The skill helper now
waits for native activation and readiness before sending the shortcut; its
native regression passed after deployment in `f02c3e961af4bf2d`.

The log-viewer case exposed a concrete provider mismatch: the model requested
`run_command`, as documented for GPT-Live, but Pi had no such tool. Pi now
registers the same definition and literal-argument execution semantics. A test
executes a harmless command and verifies arguments are not interpreted by a
shell, and that cancellation is honored.

The quoted-farewell follow-up also launched an unnecessary browser. Cancelling
that operation hung because the launcher had exited while its descendant kept
stdio open. The command runner now rejects on explicit cancellation or timeout
without waiting for descendant pipes to close. A regression reproduces this
with a short-lived launcher and verifies prompt cancellation. This does not fix
the model's incorrect decision to open a browser for arithmetic.

Evidence for that run is under
`/tmp/oma-local-verification/20260926-185410-3347222`. English cases were not run
in that interrupted invocation. The harness now stops on cleanup failure even
with `--keep-going`, leaving subsequent cases `not_run` rather than testing a
contaminated desktop. The explicit English follow-up is recorded separately
under `/tmp/oma-local-followup`.

In the English follow-up on `f02c3e961af4bf2d`, both empty-start and retained-file
scenarios verified an empty, unsaved OmaText buffer and side-by-side layout.
Both full scenarios still failed at spoken application closure. The model
repeated screenshot/click attempts instead of using `close_application_window`;
one trace exhausted the context after those attempts. These are failures, not
passes inferred from the successful opening steps.

Offline verification after these runtime changes: 198 Node tests, 39 QML tests
and two GPU fixtures (3 checks each) passed. The subsequently added harness
cleanup regression passed in its seven-test Python suite. These offline results
do not replace the failed live cases or the billing-blocked GPT-Live rerun.

The English `modes` and `farewell` cases passed end to end in
`/tmp/oma-local-followup/20260926-190203-3382325`. Mode restoration completed in
2.99 seconds after recognition; direct goodbye dismissed O.M.A. in 5.92 seconds
after recognition (including the reply). The run restored GPT-Live, automatic
locale, the Yamaha microphone, normal view and workspace 2. No temporary test
microphone modules remained; the assistant was closed and the wake listener
was ready. Japanese log viewing and retained-file closure need another live
run with the latest fixes; the broader local behavior parity is not yet proven.

### Local sampling investigation

Replaying the failed English close request against the same 4B model showed
nondeterministic tool selection: with default sampling, two of three trials
selected `close_application_window` and one selected an unrelated right-click.
With temperature 0.2, all three trials selected `list_windows`. These were
isolated inference probes with no tool execution, not desktop passes. A 9B
probe also selected a suitable tool, but the earlier exact-dictation failure
means there is still no basis to replace the default model.

Local Pi sessions now pass temperature 0.2 through their stream function. The
real-SDK integration fixture verifies the outgoing HTTP request includes it
only for `oma-local`, preserving the configured behavior of other Pi providers.
The installed build is `cd7c3fffed058b79`; spoken verification is recorded under
`/tmp/oma-local-sampling/20260926-191103-3413899`.

The 4B sampling run completed all eight selected cases. English empty-start and
retained-file open/close/goodbye passed; Japanese retained-file open/close/goodbye
passed. Japanese empty-start and log-viewer closure still timed out. English
log viewing timed out. Both exact-dictation cases failed despite recognition
including the formatting instructions. Lower temperature improves a particular
replayed decision but is not evidence of general local parity.

A model-free native check of `oma transcript` opened the actual default editor
and docked O.M.A. successfully. The CLI is not universally failing to launch;
the live failure needs diagnosis in its actual invocation context.

An experimental installed build `d8bbf27ac873db3e` used Qwen3.5 9B with low
reasoning and a 4096-token response budget; source defaults were kept unchanged.
Its results are under `/tmp/oma-local-9b-thinking/20260926-192058-3472459`.
English dictation still used a comma and lowercase `it`; Japanese used a normal
space instead of the requested fullwidth space. Japanese document creation took
55.21 seconds after recognition. This model configuration is not adopted as the
default on the basis of those results.

The 9B experiment completed: retained-file open/close/goodbye passed in both
languages, while exact dictation failed in both. The experimental build was
removed and `cd7c3fffed058b79` restored. A subsequent isolated short-prompt probe
showed that 9B without reasoning could produce the exact Japanese fullwidth
space, while low reasoning produced the exact English punctuation/case. Neither
setting passed both languages in that probe; no per-test language-specific
model switch or output correction was introduced. The remaining failures are
not resolved by the larger model or temperature adjustment alone.

Final focused regressions for this iteration passed: real Pi SDK integration,
Pi tools/lifecycle, local agent configuration and seven harness tests. Runtime
settings were checked after restoring the normal installed build: GPT-Live,
automatic locale, Yamaha input, closed normal-mode O.M.A., wake listener ready.
The API billing block still prevents verification of the latest GPT-Live fixes.

### Execution roles, window polling and native focus

The execution prompt no longer contains the speech frontend's delegation policy.
The bundled skill now distinguishes GPT-Live/Responses from local/Pi execution;
both backends are told to execute registered tools directly. The policy still
reaches the speech frontend. Profile and real-SDK regressions verify the split.

The Japanese close failure in
`/tmp/oma-role-separation/20260926-192958-3515452` had a concrete runtime cause:
the model supplied the correct current OmaText address, but the companion's
periodic poll held `busy` and the close tool rejected with “Window layout is
changing”. Explicit close/accompany requests now await that in-flight poll.
A controlled asynchronous regression reproduces the collision before the fix
and passes afterward. Unknown addresses now raise an error instead of claiming
that a window was closed. A separate test verifies closing another identified
window leaves O.M.A. attached to the original one.

After the polling fix, Japanese empty-start open/close/goodbye passed in
`/tmp/oma-close-poll-fix/20260926-193531-3546888`. The retained-file case still
found OmaText's native window inactive despite compositor focus. The new-document
skill now clicks the current verified editor bounds when native activation is
missing, then waits for activation before sending the shortcut. It refuses to
do this over unsaved work or a dialog. Its direct native check passed four
consecutive runs. These checks bypass agent decisions, but opening O.M.A. still
starts its selected voice provider; they are not offline/API-free checks.

Japanese log viewing in the role-split run failed after Whisper recognized
“加工ログ” instead of “過去ログ”; the model asked a clarification question.
An offline comparison of eight existing Japanese/English WAV fixtures with
Whisper Small beam sizes 1 and 5 did not fix that Japanese ambiguity. Beam 5
corrected English “Could a period” to “Put a period” but offered no general
resolution. No beam setting change has been adopted from this comparison.

The native-focus live run under `/tmp/oma-native-focus-fix` switched to a new
blank buffer in both languages. English completed closure/goodbye; Japanese
still failed after the model chose repeated visual clicks instead of the close
tool. The new-document helper now returns its verified structured result and
frame metadata without an unsolicited full-screen image. The desktop screenshot
tool remains available for actions that actually require visual inspection.

Whisper Turbo was downloaded to a separate comparison directory and tested on
the same eight fixture WAVs. It did not resolve “加工ログ” and took approximately
3.5–4.4 seconds per clip, compared with Small's approximately 0.8–1.9 seconds.
It was not adopted. A short English context naming the desktop assistant and
OmaText corrected application-name recognition in both languages. Small with
that context and beam size 5 is now under live verification; the transcription
contains no forced language-specific substitution for the failed log phrase.

## Dictation isolation and offline verification at 20:04 JST

The full offline suite passed: 202 Node tests, 8 Python tests and 45 QML tests
including GPU checks (`/tmp/oma-verification-final.log`). This does not override
the failed spoken dictation cases above.

A candidate tool description explicitly requesting final document contents was
compared with the current schema using the actual recognized Japanese/English
requests, three attempts per language and variant. It did not correct the
formatting failures and was not adopted. Evidence:
`/tmp/oma-document-schema-compare.log`.

Ollama 0.18.2 was separately downloaded, checksum-verified and run on port 11436
against the same Qwen3.5 4B model file, current prompts and tool schema. Three
attempts per language also failed to produce the required exact document text:
Japanese included instructions or selected only window inspection; all English
attempts used a comma and lowercase “it”. These were model-output probes, not
desktop operations. The comparison server was stopped; installed Ollama 0.34.4
and the production build were unchanged. Evidence:
`/tmp/oma-old-engine-compare.log`. An older engine is not a demonstrated remedy.

A further current-engine Qwen3.5 4B probe enabled low reasoning and allowed 4096
output tokens, preserving the actual recognized requests, full prompt and tools.
None of three attempts per language produced the expected exact text. Two
Japanese attempts exhausted the output limit after approximately 65 and 72
seconds without a tool call; the third used incorrect punctuation/spacing.
All English attempts retained the comma and lowercase “it”. Evidence:
`/tmp/oma-4b-reasoning-compare.log`. This configuration was not adopted, and its
owned comparison server was stopped. Exact dictation remains a failing test.

Further isolated probes used a short system prompt with either all desktop tools
or only the document tool (three attempts per language and variant), then no
tools and a plain-text-only formatting instruction (three attempts per language).
All retained incorrect formatting or copied editing instructions into Japanese
document content. Removing the long profile or tool selection alone is therefore
not a demonstrated fix. These probes did not execute desktop actions or change
production settings. Evidence: `/tmp/oma-short-context-compare.log` and
`/tmp/oma-dictation-text-compare.log`.
