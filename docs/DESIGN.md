# O.M.A.: GPT-Live desktop voice

The supported architecture is defined by [ADR 0007](adr/0007-gpt-live-only.md).

```text
QML (omarchy-shell) ↔ Node worker ↔ GPT-Live ↔ Responses backend
                       │                           │
                       └── PC/memory tools ←───────┘
                           SQLite / desktop commands
```

`main.mjs` watches the owning process and starts `main-live.mjs` unconditionally.
Legacy provider preferences and environment variables are ignored without deleting
saved settings. No Local/Pi or configurable STT/TTS runtime is available.

`live-session.mjs` owns continuous PCM, captions and Responses tool-result flow.
It waits for complete function output items, executes tools serially, returns all
results before continuing, and rejects late callbacks after closing.
`local-tools.mjs` means tools executed on this PC, not the retired Local provider.
It retains memory, documents, camera, window controls, approvals and mini mode.
`live-config.mjs` supplies the bundled OMA/camera and installed Omarchy skills,
bounded saved facts and the configured backend model (default `gpt-6-luna`, low
reasoning effort). Voice remains `gpt-live-1` / `cedar` by default.

Only explicit conversations and voice tests open paid sessions. Initialization
and Settings remain idle. Greeting/farewell cache generation starts after an
explicit session connects and is cancelled on stop. The first uncached greeting
uses Live; future conversations can reuse the processed clip. Manual close cancels
operations and finalizes billing. Input interruption is distinct from cancelling
a running PC task. Existing idle notices and dismissal follow playback completion.

Audio remains 24 kHz mono PCM, the streaming Python/NumPy FFT vocoder at 50% blend,
radio filtering, 300% output volume, normal playback rate and 250 ms startup buffer.
The startup/closing cue, microphone selection, local wake recognition, lip levels,
response language and cached greetings/farewells are retained. Python is required;
there is no audio rewrite or new claim of listening verification.

Memory and transcript tables reuse the existing private SQLite database. Captions
are observations rather than trusted instructions or proof of audible playback.
Forgetting removes matching records/exports and ends the active session without
persisting stale captions. Historical Pi sessions and downloaded models are left
on disk and never loaded by this runtime.

## Desktop context and safety

`hyprland-context.mjs` observes events only during an active Live conversation.
Bounded read-only queries track O.M.A.'s workspace, monitors, visible windows and
recent focus. Failures replace the prior inventory with stale/unavailable state.
The observer collects no screenshots or persistent inventory. Context updates
replace the Responses backend's current snapshot without starting speech or tools.
The frontend delegates desktop questions; it cannot replace its own context.
Already-running inference cannot be made retroactively fresh.

Metadata is untrusted and does not authorize a target. A fresh `list_windows` and
unambiguous user intent are still required before consequential actions. Existing
window checks, unsaved-document handling and floating restoration remain intact.
See [ADR 0006](adr/0006-continuous-desktop-context.md) for the historical rationale
and cloud protocol limits; its Pi boundary is retired by ADR 0007.

## Packaging

[scripts/runtime-files.txt](../scripts/runtime-files.txt) is the explicit local
installer payload. Relative imports, QML resources, Python helpers, executable
skill resources, pre-Node setup and immutable build behavior have offline checks.
Only OpenAI and ws are npm dependencies; install scripts and bin links stay disabled.
Every new content hash has independent node_modules. No installed-build garbage
collection or user-data migration is performed. Maintained face/CRT authoring
assets stay in source but are excluded from the runtime payload.

Removed architecture documents, model comparisons and previews are available in
[the snapshot archive](ARCHIVE.md).

## Source layout

The root [manifest](../manifest.json) loads host entry points from `qml/`:
[Service](../qml/Service.qml), [Overlay](../qml/Overlay.qml), and
[BarWidget](../qml/BarWidget.qml). [Conversation](../qml/views/Conversation.qml)
and [Settings](../qml/views/Settings.qml) live in `qml/views/`; reusable visual
components live in `qml/components/`. Explicit relative directory imports keep
the same tree usable from Git and content-addressed builds, without custom Qt
modules. Runtime, scripts and assets stay at the payload root.
