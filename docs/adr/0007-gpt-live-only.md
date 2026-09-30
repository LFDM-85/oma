# ADR 0007: Support GPT-Live only

- Status: Accepted
- Recorded: 2026-09-29
- Supersedes: [0002](0002-cloud-and-local-voice.md); the Local/Pi-specific boundaries
  in [0001](0001-shell-and-worker-boundary.md), [0003](0003-skills-and-shared-tools.md)
  and [0006](0006-continuous-desktop-context.md)

## Context

The user chose the existing GPT-Live experience and requested a substantially
smaller codebase/package after preserving the complete previous snapshot.
Keeping Local/Pi and a configurable STT/TTS pipeline imposes model setup,
dependency, UI and evaluation maintenance unrelated to that supported experience.

## Decision

Always start GPT-Live. Remove provider selection, Pi onboarding, local inference
and configurable speech adapters. Ignore legacy provider preferences/environment
variables without deleting other settings or user data. Idle initialization must
not open paid connections, including greeting generation. Prepare missing cached
greetings/farewells only after an explicit conversation or voice test connects.

Retain the current models, voice and audio algorithm, including Python/NumPy
processing; a JavaScript-only rewrite is unnecessary. Keep the existing memory,
transcripts, credentials, camera/PC tools, window safety, wake and visual behavior.
`local-tools.mjs` remains the Live backend's on-device tool implementation.

Keep only OpenAI and ws as npm dependencies. Bound local installation to an
explicit file list; retain content-addressed immutable QML builds with independent
dependencies and no destructive garbage collection. Keep face/CRT authoring source
outside the runtime payload. Archive Local/model-comparison suites and generated
bulk at [the snapshot tag](../ARCHIVE.md); preserve meaningful Live/audio/UI tests.

## Alternatives

- Keep dormant providers: retains the maintenance and package costs being removed.
- Rewrite the audio stack: adds behavior risk with no need for the chosen scope.
- Delete model caches or rewrite Git history: changes user data and recoverability
  outside this decision.

## Consequences

All supported conversations require GPT-Live API access and incur its usage cost.
Offline conversation and configurable STT/TTS are no longer features. Optional
wake recognition remains local. Existing user models, Pi sessions, keys, memory,
transcripts and old installed builds remain untouched. The previous implementation
is recoverable from `before-gpt-live-only-2026-09-29`.

Offline tests establish dependency closure, lifecycle and fixture behavior, not
human listening, microphone acoustics or real cloud/desktop end-to-end success.
The first conversation without an opening cache uses the existing live greeting
path; no billed precomputation happens merely because the plugin was loaded.
