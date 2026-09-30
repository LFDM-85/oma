"""Render production Overlay/Conversation/Face without service, mic or API access.

Requires existing Qt development tools and qs. --surface-only checks native surface
format and background pixels without asserting unsupported software GPU effects; default uses OpenGL to cover MultiEffect and CRT.
--prepare DIR creates a standalone host fixture (no compositor commands).
Run `qs -p DIR/shell.qml` on the host; captures normal.png, mini.png and
normal-restored.png and exits after the mode round trip (normal opens at 5s, mini at 10s,
normal returns at 15s, exit at 20s). This opens one isolated
window titled O.M.A.; do not run it alongside the installed overlay when checking
compositor rules. The fake service has no processes or credentials.
"""
import argparse
import os
from pathlib import Path
import shlex
import shutil
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parent.parent


def prepare(directory, surface_only=False):
    directory.mkdir(parents=True, exist_ok=True)
    for source in ROOT.glob("*.qml"):
        if source.name not in {"Service.qml", "BarWidget.qml", "Settings.qml"}:
            shutil.copy(source, directory / source.name)
    overlay = (directory / "Overlay.qml").read_text()
    overlay = overlay.replace("id: root", "id: root\n    property alias testWindow: window", 1)
    (directory / "Overlay.qml").write_text(overlay)
    shutil.copytree(ROOT / "assets", directory / "assets", dirs_exist_ok=True)
    shutil.copytree(ROOT / "tests/qml-imports/qs", directory / "qs", dirs_exist_ok=True)
    (directory / "Settings.qml").write_text("import QtQuick\nItem { property var service; property bool opened; signal dismiss(); signal back() }\n")
    fixture = (ROOT / "tests/fixtures/overlay-render.qml").read_text()
    if surface_only:
        fixture = fixture.replace("property bool surfaceOnly: false", "property bool surfaceOnly: true")
    (directory / "shell.qml").write_text(fixture)
    plugin = directory / "OmaRenderProbe"
    plugin.mkdir(exist_ok=True)
    shutil.copy(ROOT / "tests/fixtures/overlay-render-probe.cpp", plugin)
    moc_flags = shlex.split(subprocess.check_output(["pkg-config", "--cflags", "Qt6Qml"], text=True))
    moc = shutil.which("moc") or next((str(path) for path in (
        Path("/usr/lib/qt6/moc"), Path("/usr/lib/qt6/libexec/moc"),
        Path("/usr/lib/qt6/bin/moc")) if path.is_file()), None)
    if not moc:
        raise RuntimeError("Qt moc is required for the native test probe")
    subprocess.run([moc, *moc_flags, str(plugin / "overlay-render-probe.cpp"),
                    "-o", str(plugin / "overlay-render-probe.moc")], check=True)
    flags = shlex.split(subprocess.check_output(
        ["pkg-config", "--cflags", "--libs", "Qt6Quick", "Qt6Qml", "Qt6Gui"], text=True))
    subprocess.run(["g++", "-std=c++17", "-shared", "-fPIC",
                    str(plugin / "overlay-render-probe.cpp"), "-o",
                    str(plugin / "libomarenderprobe.so"), *flags], check=True)
    (plugin / "qmldir").write_text("module OmaRenderProbe\nplugin omarenderprobe\n")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--prepare", type=Path)
    parser.add_argument("--surface-only", action="store_true")
    args = parser.parse_args()
    if args.prepare:
        prepare(args.prepare.resolve())
        fixture = args.prepare.resolve() / "shell.qml"
        fixture.write_text(fixture.read_text().replace("interval: 1600", "interval: 5000"))
        print(f"QML_IMPORT_PATH={args.prepare.resolve()} qs -p {args.prepare.resolve() / 'shell.qml'}")
        return
    with tempfile.TemporaryDirectory(prefix="oma-overlay-render-") as temporary:
        directory = Path(temporary)
        prepare(directory, args.surface_only)
        environment = dict(os.environ, QT_QPA_PLATFORM="offscreen", QT_QPA_PLATFORMTHEME="basic",
                           QT_QUICK_BACKEND="software" if args.surface_only else "rhi",
                           QSG_RHI_BACKEND="opengl", QT_QUICK_CONTROLS_STYLE="Basic",
                           QML_IMPORT_PATH=str(directory), HYPRLAND_INSTANCE_SIGNATURE="",
                           WAYLAND_DISPLAY="", XDG_CACHE_HOME=str(directory / "cache"),
                           XDG_RUNTIME_DIR=str(directory / "runtime"))
        result = subprocess.run(["qs", "-p", str(directory / "shell.qml")], env=environment,
                                capture_output=True, text=True, timeout=20)
        output = result.stdout + result.stderr
        print(output)
        assert result.returncode == 0 and "OVERLAY_RENDER_PASS" in output and "OVERLAY_RENDER_FAIL" not in output, "Overlay rendering assertion failed (see output above)"
        print("Native Overlay " + ("surface/background" if args.surface_only else "GPU rendering") + " round trip: PASS")


if __name__ == "__main__":
    main()
