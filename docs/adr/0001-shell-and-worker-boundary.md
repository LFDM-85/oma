# ADR 0001: Keep presentation in the shell and runtime work in a worker

- Status: Accepted; Local/Pi-specific behavior superseded by [0007](0007-gpt-live-only.md)
- Recorded: 2026-09-28

## Context

O.M.A. is an Omarchy Quattro plugin with a face, captions, settings and desktop
interaction. Model sessions and audio devices have lifecycles that must not block
the shell or survive unnoticed after the owning UI process exits.

## Decision

Run QML presentation inside the existing Omarchy shell. Use a Node worker for
provider connections, audio coordination, memory and tool execution. Use native
helpers where needed for desktop and media operations. Keep the custom face and
conversation presentation in O.M.A.; use shell components for ordinary controls.

The shell owns the worker. Closing or switching providers must stop the relevant
conversation resources and reject stale callbacks. The worker also watches for
loss of its parent process. UI speech indicators follow playback state rather
than assuming generated text has already been heard.

## Alternatives

- A separate desktop application: duplicates shell integration and lifecycle work.
- Networking and agent execution in QML: mixes asynchronous backend work with UI ownership.
- A wholesale runtime rewrite: no measured evidence that changing language resolves
  model generation or network latency.

## Consequences

The worker protocol and cancellation boundaries need tests. Native dependencies
remain part of installation. Performance changes should target measured delays;
this boundary does not itself guarantee low latency or eliminate crashes.

## Implementation references

- [Service.qml](../../Service.qml)
- [Conversation.qml](../../Conversation.qml)
- [Runtime entry point](../../runtime/main.mjs)
- [Design](../DESIGN.md)
