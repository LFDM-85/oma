# ADR 0002: Support separate cloud and local voice paths

- Status: Accepted
- Recorded: 2026-09-28

## Context

Continuous cloud voice interaction and offline speech inference have different
protocols, latency and hardware requirements. Users need a local option without
silently starting a paid cloud session.

## Decision

Offer persisted GPT-Live and Local choices. GPT-Live is the default. Its voice
session delegates tools through the Responses backend. Local uses a separate
STT → Pi agent → TTS pipeline. Both integrate with O.M.A.'s desktop tools,
language/microphone settings and durable local memory.

Stop the current conversation before changing workers. Local inference must not
silently fall back to a cloud API; downloading models is a separate setup step.
Keep speech adapters replaceable. Do not interpret a model chosen on one developer
machine as a permanent global default.

## Alternatives

- Cloud only: excludes offline use and ties all voice interaction to paid access.
- Local only: gives up the available continuous cloud voice path.
- Force both through one speech protocol: hides meaningful differences in streaming,
  interruption and tool lifecycles.
- Reinstate Realtime → Codex delegation: an older architecture, not the current
  provider selection implemented by the runtime entry point.

## Consequences

Both paths need language, cancellation, tool-safety and end-to-end verification.
They share product behavior, but quality and latency need not be identical. Pi is
required by Local; it is not the execution engine of the GPT-Live path. Provider
switching must avoid orphan microphones, playback and billable sessions.

## Implementation references

- [Provider selection](../../runtime/voice-provider.mjs)
- [Runtime entry point](../../runtime/main.mjs)
- [Live session](../../runtime/live-session.mjs)
- [Pipeline runtime](../../runtime/main-pipeline.mjs)
- [Local speech worker](../../runtime/local-speech.py)
