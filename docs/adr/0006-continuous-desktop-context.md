# 0006: Observe Hyprland metadata during conversations

Date: 2026-09-28
Status: Accepted

## Context

A user may refer to an application beside O.M.A. while another workspace has
keyboard focus. An on-demand `list_windows` call alone cannot keep the reasoning
context current. Continuous screenshots would collect unrelated content and
consume inference capacity. Window titles themselves are untrusted data.

## Decision

Own one injectable `HyprlandContext` per runtime. Cloud starts/stops it with the
active `LiveSession`; Pi starts it with the agent session, stops it on close,
and the pipeline also stops it when presentation closes. It never opens a model
session itself. Pi notice-only speech does not need desktop inventory.

Read `$XDG_RUNTIME_DIR/hypr/$HYPRLAND_INSTANCE_SIGNATURE/.socket2.sock`. Events
invalidate a snapshot; their payloads do not become instructions or command
arguments. Coalesce bursts for 80 ms, then read `clients`, `monitors`,
`activeworkspace` and `activewindow` through the existing abortable command runner.
Serialize refresh groups. Reconnect with exponential delays from 1 to 30 seconds;
reconcile every 15 seconds, also covering geometry changes without an IPC event.
Missing Hyprland environment starts neither commands nor timers. Stop aborts
queries, destroys the socket, cancels timers and invalidates late callbacks.

Keep an in-memory snapshot with independent O.M.A. and active workspaces, monitor
workspaces (including special workspaces), pinned visibility, focus and recent
non-O.M.A. focus, geometry and window flags. O.M.A. identification shares the
existing companion title heuristic (`O.M.A.` / `O.M.A. Mini`), not an authenticated
application identity; multiple O.M.A. workspaces produce an unknown singular
workspace. O.M.A. windows are separated from application candidates. Positions
use compositor coordinates. Visibility means mapped/non-hidden on a displayed
workspace or pinned monitor, not a guarantee of unobscured pixels.

Limit application windows to 64, O.M.A. windows to 8, monitors to 16, titles to
256 characters and other strings to 128. Include explicit truncation counts.
Unknown fields remain null. Failure replaces the inventory with stale/unavailable
state and `windows: null`; it never masquerades as an empty desktop. Successful
fallback queries can restore current metadata even while the event socket retries.
Snapshots are four queries, not an atomic compositor transaction. Rapid changes
and sub-debounce focus transitions may be missed; action tools must refresh.

### Cloud protocol boundary

Installed OpenAI SDK 7.23.0 supports `session.update` for
`session.delegation.responses.instructions`. Replace that field with the stable
backend instructions plus one delimited JSON snapshot; never append snapshots
to the conversation. Put the initial snapshot in backend startup instructions,
refresh on observer updates and delegation notification, and await a fresh query
before typed requests and tool continuations. No metadata update sends commentary,
user input, thinking/instructions append, or `response.create`.

Frontend instructions are immutable. The voice frontend therefore gets static
guidance to delegate current desktop/workspace/window questions to the backend,
**no volatile startup snapshot**. This is an intentional protocol limitation:
the frontend does not itself maintain replaceable live window knowledge. A
server-started delegation can race a new event/query; its notification cannot
retroactively change an already-running response. The backend receives the most
recent delivered snapshot; subsequent continuations refresh. Existing action
checks and a fresh `list_windows` remain necessary. Session updates are sent in
transport order; real provider acknowledgement/model behavior was not exercised.

### Pi boundary

Use Pi's `agent.transformContext` request projection. Chain its existing transform,
refresh before every inference (including tool continuations), and add one data
block to the latest system message of a copied request. Preserve tools and original
messages; do not call `sendCustomMessage` or mutate/persist the session transcript.
Stable guidance marks window text as untrusted and addresses as advisory.

## Safety and privacy

No screenshots, content extraction, window mutations or model calls are caused by
observation. Titles/class names/geometry/workspaces are still potentially personal
metadata. Active cloud sessions send the bounded snapshot to their configured
Responses backend; local sessions pass it to the configured Pi model. No continuous
inventory is written to O.M.A. memory, transcript or task checkpoints by this code.
A model may mention metadata in an ordinary answer, which follows existing caption
storage. Provider-side retention is governed by the existing provider/session
configuration; this change does not promise provider-side deletion.

Relative references normally concern O.M.A.'s workspace. Focus, recent focus and
position are evidence, never enough to close an ambiguous application. Existing
`WindowReferences` observation IDs and resolve freshness checks are unchanged.
Cloud retains its existing explicit-address tool contract; advisory observer
addresses do not replace the required fresh tool observation or authorize actions.

## Alternatives

- Periodic screenshots: rejected for privacy, cost and unnecessary visual input.
- Only `list_windows`: insufficient for changing conversational context.
- `session.thinking.append`: supported silent context, but appends to the cloud
  timeline, has a 500-token limit and cannot replace previous state.
- Invented frontend replacement events: unsupported by the installed SDK.
- Restart cloud sessions on updates: disrupts speech and conversation continuity.

## Verification boundary

Automated tests use synthetic compositor data and mocked provider wires. They
cover initial/event refresh, fragmented events, burst coalescing, multimonitor,
special/pinned windows, unavailable state, backoff, reconciliation, shutdown,
late callbacks, backend replacement, no autonomous response, startup races and
Pi request projection. Existing close-target regressions are rerun.

No paid inference, microphone conversation, real desktop mutations, screenshots,
production reload or provider behavior verification is part of this change.
A separate read-only smoke prints status/counts only; actual run results are
reported with the implementation handoff rather than inferred from unit tests.
In the restricted implementation worker, the smoke returned
`unavailable / query_failed`, then `stopped: true`; live Hyprland event delivery
and real cloud voice behavior therefore remain unverified.

## Sources

- [Hyprland IPC](https://wiki.hypr.land/IPC/): current event socket path and framing.
- Installed `openai/resources/live/live.d.ts`: `SessionUpdateEvent`,
  `ResponsesDelegationUpdateConfig`, `ThinkingAppendEvent` (SDK 7.23.0).
- [GPT-Live session management](https://developers.openai.com/api/docs/guides/live-conversations).
- Installed Pi `agent-loop.js` and `agent-session.js`: request context projection.
