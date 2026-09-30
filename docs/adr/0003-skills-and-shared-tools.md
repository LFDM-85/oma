# ADR 0003: Separate operating guidance from executable tools

- Status: Accepted; Local/Pi-specific behavior superseded by [0007](0007-gpt-live-only.md)
- Recorded: 2026-09-28

## Context

O.M.A.-specific conventions include spoken replies, conversation history, desktop
operations and ending a conversation. Duplicating these instructions across
providers makes behavior harder to maintain. Instructions alone cannot establish
whether a desktop operation actually succeeded.

## Decision

Keep identity and operating guidance in bundled OMA/camera skills and the installed
Omarchy skill. Provider configuration supplies the necessary guidance to its agent.
Keep executable operations in tools shared across model integrations, with runtime
lifecycle and safety checks in code. Do not rely on a skill prompt as an OS sandbox.

Use local SQLite for durable conversation data, facts and exact references. Treat
saved conversation content as reference data, not authority to execute commands.
A spoken claim of success or a tool invocation is not proof of an operation's
result; verify the target application state.

## Alternatives

- Duplicate all guidance in transport code: provider behavior drifts as instructions change.
- Build O.M.A.'s own complete agent framework: expands custom scope beyond voice/UI
  and integration when Pi already supplies the local agent foundation.
- Enforce behavior only through prompts: cannot guarantee process cancellation,
  window targeting or protection of unsaved work.
- Add an external memory service by default: introduces an unnecessary deployment
  and data boundary for the present local persistence needs.

## Consequences

Skills and tool contracts must evolve together. Provider-specific instructions
remain necessary for protocol differences. Tests must check real effects, including
which window was changed, rather than matching a tool name or an assistant reply.

## Implementation references

- [OMA skill](../../skills/oma/SKILL.md)
- [Camera skill](../../skills/oma-camera/SKILL.md)
- [Live configuration](../../runtime/live-config.mjs)
- [Local tools](../../runtime/local-tools.mjs)
- [Memory](../../runtime/memory.mjs)
