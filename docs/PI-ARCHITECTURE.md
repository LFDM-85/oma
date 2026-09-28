> Historical design. The current default is [GPT-Live](DESIGN.md).

# O.M.A. architecture: Pi-based target

Status: Pi SDK migration implemented locally on 2026-09-23. See
[VERIFICATION.md](VERIFICATION.md) for tested behavior and remaining limits.

O.M.A. stands for **Omarchy Machine Assistant**, pronounced **OH-mah**.
The product name is O.M.A. (OMA).

Use Pi as the agent foundation inside O.M.A. Keep O.M.A.-specific code focused
on voice input/output, the desktop UI, and tools that connect the agent to those
surfaces. Express identity and operating guidance through bundled skills.
Do not require users to set up Hermes or another full assistant product.

The runtime now embeds Pi SDK 0.87.1. OpenAI STT/TTS is the default speech pair;
command adapters support alternative speech backends. The previous implementation
is described in [CURRENT-ARCHITECTURE.md](CURRENT-ARCHITECTURE.md) for historical
reference; it is no longer the current runtime. Installation is in [README](../README.md).

## Runtime and ownership

```text
Omarchy shell: QML UI, face, subtitles, controls
                    | existing worker messages
O.M.A. Node worker: capture, playback, turn timing, cancellation
       |                                      ^
Speech recognition -> text -> Pi session -> reply text -> speech synthesis
                               |
                     O.M.A. skills and tools
                               |
                   Desktop, camera, memory store
```

Embed Pi through its TypeScript/JavaScript SDK in the existing Node worker.
The shell must not host model networking or the agent loop. Prefer the SDK over
terminal automation or a new network service. RPC remains a fallback only if
packaging or process isolation makes SDK integration unsuitable.

One Pi session handles both conversation and requested actions. Remove the
Realtime conversational agent -> run_task -> Codex delegation layer during
migration. Do not build a replacement agent loop, model registry, tool dispatcher,
or context compressor in O.M.A. when Pi supplies it.

| Owner | Responsibilities |
| --- | --- |
| QML | Face, subtitles, settings presentation, microphone/playback indicators, confirmation UI |
| O.M.A. worker | Audio devices, wake detection, speech providers, turn boundaries, playback queue, generation fences, UI events |
| Pi | Model connection, agent loop, tool execution lifecycle, session persistence/resume, context compaction, skill/extension loading |
| O.M.A. skills | Identity, concise spoken replies, desktop operating conventions, when and how to use O.M.A. tools |
| O.M.A. tools | Existing desktop/camera operations, exact URL recording, durable memory access, confirmation, close/restart actions |

Keep F8, wake detection, automatic listening, the face, locale behavior, tiling
conventions, and visible-work requirements. Backend replacement is not a UI
redesign. Keep plugin ID `io.github.komagata.oma`.

## Skills and tools

Load `skills/oma/SKILL.md`, `skills/oma-camera/SKILL.md`, and the installed
Omarchy skill explicitly. The latter can be selected with `OMA_OMARCHY_SKILL`.
Do not load unrelated personal extensions or project instruction files.
Remove Codex/run_task instructions and descriptions of mandatory OpenAI setup.
Keep behavior instructions in skills rather than duplicating them in transport
code. Load the short identity and voice instructions at session creation; do not
rely on the model discovering a skill before it can introduce itself correctly.
Use Pi resource loading for the remaining task-specific guidance.

Expose the existing desktop and camera helpers as Pi custom tools. Use Pi's
standard file and shell tools where appropriate instead of writing equivalents.
Expose memory, open_url, end_conversation, restart_assistant, and confirm_action
through the same session. Register only tools supported by the current machine.
Camera/screenshot understanding requires an image-capable model; a text-only
model must not claim to have inspected an image.

A skill describes behavior; it cannot stop audio, enforce cancellation, store
facts, or move a pointer by itself. Those operations remain executable tools or
worker logic. Keep consequential-action confirmation in the tool/event bridge
and preserve its existing policy. Do not describe unrestricted shell access as
an OS sandbox or claim that skill wording guarantees approval enforcement.

## Speech and interruption

Realtime API is not required. Use independently selected speech-to-text (STT),
Pi/model, and text-to-speech (TTS) components. Start with one verified STT/TTS pair;
choose it by Japanese accuracy, response latency, installation effort, and voice
quality. The initial default is OpenAI gpt-4o-transcribe and gpt-4o-mini-tts (cedar). Cloud and local
implementations must fit the same worker boundary; no promise of an immediately
available fully local configuration is made.

Retain PipeWire capture/playback, echo cancellation, wake detection, pre-roll,
recording limits, and face animation where reusable. Convert speech-provider
formats at that boundary. The current Cedar voice is provider-specific and is
not a requirement of the new backend; preserve the intended calm electronic
character rather than promising identical voice output.

Stream Pi text into subtitles. Queue speakable sentence segments for TTS and
preserve their order. Never read tool arguments, reasoning, or raw tool output
aloud. Local acknowledgments need not start an agent turn.

On interruption, stop playback immediately, cancel pending STT/TTS and Pi work,
and fence late callbacks by turn generation. Serialize the next Pi turn after
cancellation settles. Record which answer segment was actually played: generated
text is not proof the user heard it. A canceled action may already have effects;
report completed/uncertain work honestly. Closing, locking, or muting must not
allow a late callback to resume capture or revive the panel.

## Sessions and durable memory

Pi owns the active conversation and its compaction. Persist O.M.A. sessions in
an O.M.A.-specific state directory, separate from the user's ordinary Pi work.
Restart resumes the selected session without repeating the previous request.

Long-term memory is a separate requirement, not an assumed Pi feature. Reuse the
existing SQLite facts, exact URLs, action records, and search tools initially.
Do not replace a working memory store with a second generic memory framework.
Inject a bounded selection of durable facts at session start and let the model
search older records when needed. Skills describe how to use remember,
search_memory, and forget; the tools perform and verify the persistence.

Pi session history becomes the authority for new conversational context. Keep
legacy SQLite conversations searchable during migration, but do not run the old
conversation summarizer alongside Pi's compaction or inject duplicate histories.
Checkpoints describe observed work, not successful completion by implication.

Forgetting must cover the relevant durable records and any O.M.A.-owned Pi
session/compaction content that could restore the forgotten information. Cancel
in-flight work first and retain revision fences. If Pi has no supported selective
history deletion, start a clean session and remove the affected O.M.A. session
files after applying the supported retention procedure. Never edit the user's
unrelated Pi sessions. Explain the scope: external files and backups are not
implicitly erased. Verify this behavior before offering the migrated forget tool.

## Models, authentication, and setup

Use Pi's model and credential facilities. Do not add an O.M.A. model API client
or duplicate Pi credentials into an O.M.A. database. Reuse existing Pi credentials
and saved default model; keep session/resource isolation independent of credential
reuse. O.M.A. has no model override or fixed fallback. With no configured default,
open Pi's own setup for authentication and model selection. Authentication still exists even though the engine is embedded.

LLM authentication and speech authentication are independent. A Pi login does
not automatically authorize an external STT/TTS service. Speech credentials stay
in the worker's existing secret-storage boundary; QML sees only configuration
status. Never put credentials in model prompts, tool results, logs, or process
arguments. Do not silently copy the existing OpenAI key to a new provider.

O.M.A. settings cover speech and audio devices, with a launcher for Pi setup. Do not change the Omarchy default agent
or require Hermes installation. A local model needs a running compatible server;
tool calling, image support, and performance are per-model capabilities to test.

Do not automatically load all personal extensions just because credentials are
reused. Bundle O.M.A.'s resources explicitly and allow intentional additional
skills. Pin a verified Pi SDK version and lock transitive dependencies when
implementing. Decide packaging then: the current ws-only vendoring strategy is
not evidence that the Pi SDK can be shipped the same way. No silent installation
from the bar or dependency download on every voice interaction.

## Migration sequence and acceptance

1. Integrate a pinned Pi SDK into the worker behind text input. Verify streaming,
   one real tool action, cancellation, session restart, and error propagation.
2. Port O.M.A. skills and desktop/camera/memory tools. Remove run_task delegation.
   Verify new-session recall, exact URL retrieval, forgetting, and confirmation
   denial. Test both an API model and one compatible local model; document image
   or tool limitations rather than silently falling back to a cloud model.
3. Add the selected independent STT/TTS pair. Verify Japanese input/output,
   echo suppression, wake handoff, sentence ordering, and interruption during
   recognition, generation, tool execution, and playback. Measure end-of-speech
   to first audible response on the real desktop; report cold and warm conditions.
4. Update setup, settings, packaging, README, and capability descriptions. Test a
   clean installation and existing-user migration without overwriting keys or
   losing memory. Visually check normal and constrained panel sizes.
5. Retire Realtime/Codex-specific runtime code and dependencies once the new path
   passes those checks. Preserve original state for rollback; migration must be
   repeatable without duplicating history or resurrecting forgotten data.

Implemented choices: `@earendil-works/pi-coding-agent` 0.87.1, explicit npm setup
with lockfile and no lifecycle scripts or executable symlinks, shared Pi credential
configuration with separate O.M.A. sessions, OpenAI speech plus command adapters,
and deletion of O.M.A. Pi session files after a forget turn. The migration sequence
above remains the verification checklist; actual evidence and unrun scenarios
are recorded separately. A local compatible-endpoint fixture is not evidence of
Japanese tool reliability on an actual local LLM.

## Source references

Official Pi documentation checked on 2026-09-23:

- [Overview](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/README.md)
- [SDK: sessions, tools, resources, events, and cancellation](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/sdk.md)
- [Model and credential configuration, including local endpoints](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/models.md)

Repository/package names may evolve; resolve and pin the official release at
implementation time. Funding announcements are not an architectural dependency.
