"""Exercise production Overlay lifecycle with a native, offscreen FloatingWindow.

No microphone, API, or compositor commands: resize the backing QQuickWindow to
simulate compositor configure events, then verify its retained geometry.
"""
import os
from pathlib import Path
import subprocess
import sys
import tempfile

root = Path(__file__).resolve().parent.parent
with tempfile.TemporaryDirectory(prefix="oma-overlay-geometry-") as directory:
    directory = Path(directory)
    # Only expose the private window for assertions; lifecycle code stays intact.
    source = Path(sys.argv[1]) if len(sys.argv) > 1 else root / "Overlay.qml"
    overlay = source.read_text()
    overlay = overlay.replace("id: root", "id: root\n    property alias testWindow: window", 1)
    (directory / "Overlay.qml").write_text(overlay)
    (directory / "OmaPalette.qml").write_text((root / "OmaPalette.qml").read_text())
    # UI bodies have separate visual fixtures; this fixture owns only geometry.
    (directory / "Conversation.qml").write_text('''import QtQuick
Item {
    property var service
    property bool opened
    property int startupSerial
    property bool shuttingDown
    property var desktopWindows
    property string desktopWorkspace
    property real desktopAspect
    signal dismiss()
    signal settingsRequested()
}''')
    (directory / "Settings.qml").write_text('''import QtQuick
Item { property var service; property bool opened; signal dismiss(); signal back() }
''')
    (directory / "shell.qml").write_text((root / "tests/fixtures/overlay-geometry.qml").read_text())
    environment = dict(os.environ, QT_QPA_PLATFORM="offscreen", QT_QPA_PLATFORMTHEME="basic",
                       QT_QUICK_BACKEND="software", QT_QUICK_CONTROLS_STYLE="Basic",
                       QML_IMPORT_PATH=str(root / "tests/qml-imports"),
                       HYPRLAND_INSTANCE_SIGNATURE="", WAYLAND_DISPLAY="",
                       XDG_CACHE_HOME=str(directory / "cache"), XDG_RUNTIME_DIR=str(directory / "runtime"))
    result = subprocess.run(["qs", "-p", str(directory / "shell.qml")], env=environment,
                            capture_output=True, text=True, timeout=15)
    output = result.stdout + result.stderr
    assert result.returncode == 0 and "OVERLAY_GEOMETRY_PASS" in output and "OVERLAY_GEOMETRY_FAIL" not in output, output
    print("Native Overlay geometry lifecycle: PASS")
