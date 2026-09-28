# Private voice worker development smoke, v51

Japanese document/log sequences: 2/2. English: 2/2. All four include closing the
editor and ending O.M.A.; document scenarios include exact input and an explicit
unsaved discard decision. Cleanup completed. These four development observations
are not the final 60-trial acceptance matrix.

The actual worker is launched through bwrap, with the host filesystem read-only,
private temporary storage and a private writable O.M.A. data/workspace directory.
The runtime remains the production implementation; only the evaluation Service
worker command is wrapped. Wrapper and profile metadata are archived along with
the measured source. The earlier mount snapshot records the same profile and
wrapper before its source was frozen as v51. A regression test verifies protected
host-file writes fail. No ordinary user conversations/settings were copied.

Desktop IPC still reaches real host applications, so this is not a complete
hostile-agent security boundary. Workspace, unrelated-window and unsaved-document
guards are retained. Ordinary manifest entrypoints must be restored after the
full evaluation; the ordinary user's data directory is separate throughout.
