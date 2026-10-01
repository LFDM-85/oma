"""Exercise immutable packaging without installing or reloading the user's plugin."""
import json
import os
import re
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parent.parent


class PackageTest(unittest.TestCase):
    def test_role_layout_and_complete_qml_payload(self):
        manifest = json.loads((ROOT / 'manifest.json').read_text())
        self.assertEqual(manifest['entryPoints'], {
            'barWidget': 'qml/BarWidget.qml', 'service': 'qml/Service.qml',
            'panel': 'qml/Overlay.qml'})
        self.assertEqual(list(ROOT.glob('*.qml')), [])
        files = set((ROOT / 'scripts/runtime-files.txt').read_text().splitlines())
        qml = {p.relative_to(ROOT).as_posix() for p in (ROOT / 'qml').rglob('*.qml')}
        self.assertEqual(qml, set(manifest['entryPoints'].values()) | {
            'qml/views/Conversation.qml', 'qml/views/Settings.qml',
            *('qml/components/' + name + '.qml' for name in (
                'CrtEffect', 'DesktopMap', 'Face', 'Glow', 'HoloBeam', 'HoloFloor',
                'LevelMeter', 'OmaPalette', 'PanelBackdrop', 'ScanLines', 'TypewriterText'))})
        self.assertEqual({p for p in files if p.endswith('.qml')}, qml)
        self.assertTrue(set(manifest['entryPoints'].values()) <= files)

    def check_staged_qml(self, build, files):
        # Resolve against the staged tree, never the source checkout.
        for name in files:
            if not name.endswith('.qml'):
                continue
            source = build / name
            references = re.findall(r'(?:import\s+|Qt\.resolvedUrl\()["\']([^"\']+)["\']', source.read_text())
            for reference in references:
                resolved = (source.parent / reference).resolve()
                relative = resolved.relative_to(build).as_posix()
                if resolved.is_dir():
                    components = list(resolved.glob('*.qml'))
                    self.assertTrue(components, f'{name}: empty QML import {reference}')
                    self.assertTrue(all(p.relative_to(build).as_posix() in files for p in components))
                else:
                    self.assertIn(relative, files, f'{name}: missing resource {reference}')
                    self.assertTrue(resolved.is_file(), f'{name}: absent resource {reference}')
        runner = Path('/usr/lib/qt6/bin/qmltestrunner')
        if runner.is_file():
            # Real Qt loading exercises nested imports and FaceMesh.js.
            fixture = build.parent / ('probe-' + build.name)
            fixture.mkdir()
            (fixture / 'tst_Package.qml').write_text(f'''import QtQuick
import QtTest
import "{build.as_uri()}/qml/views" as Views
import "{build.as_uri()}/qml/components" as Components
TestCase {{
    name: "StagedPackage"; when: windowShown; visible: true
    width: 800; height: 900
    Views.Settings {{ id: settings; anchors.fill: parent }}
    Views.Conversation {{ id: conversation; visible: false }}
    Components.Face {{ id: face; width: 187; height: 240; active: false }}
    Components.CrtEffect {{ id: crt }}
    function test_resources() {{
        verify(settings !== null); verify(conversation !== null)
        compare(face.textureUrl.toString(), "{build.as_uri()}/assets/reference-face.png")
        tryVerify(function() {{ return face.isImageLoaded(face.textureUrl) }}, 3000)
        compare(crt.fragmentShader.toString(), "{build.as_uri()}/assets/crt.frag.qsb")
    }}
}}
''')
            result = subprocess.run([str(runner), '-import', str(ROOT / 'tests/qml-imports'),
                                     '-input', str(fixture)], capture_output=True, text=True,
                                    env={**os.environ, 'QT_QPA_PLATFORM': 'offscreen',
                                         'QT_QPA_PLATFORMTHEME': 'basic', 'QT_QUICK_BACKEND': 'software',
                                         'QT_QUICK_CONTROLS_STYLE': 'Basic'}, timeout=30)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            shutil.rmtree(fixture)

    def test_explicit_payload_and_immutable_builds(self):
        with tempfile.TemporaryDirectory(prefix='oma-package-') as temporary:
            work = Path(temporary)
            source, target, bin_dir = work / 'source', work / 'plugins' / 'oma', work / 'bin'
            source.mkdir()
            bin_dir.mkdir()
            files = (ROOT / 'scripts/runtime-files.txt').read_text().splitlines()
            self.assertEqual(len(files), len(set(files)))
            self.assertIn('skills/oma/scripts/new-document.mjs', files)
            self.assertIn('runtime/wake_match.py', files)
            self.assertIn('assets/crt.frag.qsb', files)
            self.assertFalse(any(p.startswith(('docs/', 'models/', 'output/', 'demo/', 'tests/')) for p in files))
            self.assertFalse(any('preview' in p or p.endswith(('face.json', 'face.obj')) for p in files))
            self.assertNotIn('runtime/main-pipeline.mjs', files)
            for name in [*files, 'manifest.json', 'README.md', 'LICENSE']:
                dest = source / name
                dest.parent.mkdir(parents=True, exist_ok=True)
                if name == 'runtime/oma-pointer':
                    dest.write_bytes(b'fixture pointer, never executed')
                else:
                    shutil.copy2(ROOT / name, dest)
            (bin_dir / 'npm').write_text('#!/bin/sh\n[ "$*" = "ci --omit=dev --ignore-scripts --bin-links=false" ] || exit 7\n[ ! -f "$OMA_TEST_FAIL" ] || exit 23\nmkdir node_modules\nprintf installed > node_modules/fixture\n')
            (bin_dir / 'npm').chmod(0o755)
            env = {**os.environ, 'PATH': str(bin_dir) + ':' + os.environ['PATH'], 'OMA_TEST_FAIL': str(work / 'fail')}

            def build():
                return subprocess.run(['python3', str(ROOT / 'scripts/package-build.py'), str(source), str(target)], env=env, capture_output=True, text=True)

            self.assertEqual(build().returncode, 0)
            manifest = json.loads((target / 'manifest.json').read_text())
            first = target / Path(manifest['entryPoints']['service']).parents[1]
            actual = {str(p.relative_to(first)) for p in first.rglob('*') if p.is_file() and 'node_modules' not in p.parts}
            self.assertEqual(actual, set(files))
            self.check_staged_qml(first, files)
            (first / 'node_modules/fixture').write_text('old immutable dependencies')
            self.assertEqual(build().returncode, 0)
            self.assertEqual((first / 'node_modules/fixture').read_text(), 'old immutable dependencies')
            (source / 'qml/views/Settings.qml').write_text((source / 'qml/views/Settings.qml').read_text() + '\n// New build\n')
            self.assertEqual(build().returncode, 0)
            second = target / Path(json.loads((target / 'manifest.json').read_text())['entryPoints']['service']).parents[1]
            self.assertNotEqual(first, second)
            self.assertEqual((first / 'node_modules/fixture').read_text(), 'old immutable dependencies')
            self.assertEqual((second / 'node_modules/fixture').read_text(), 'installed')
            self.assertFalse((second / 'node_modules').is_symlink())
            self.check_staged_qml(second, files)
            before = (target / 'manifest.json').read_bytes()
            (work / 'fail').touch()
            (source / 'qml/views/Settings.qml').write_text('failed build fixture')
            self.assertNotEqual(build().returncode, 0)
            self.assertEqual((target / 'manifest.json').read_bytes(), before)
            self.assertEqual(len(list((target / 'builds').iterdir())), 2)
            self.assertEqual(list(work.glob('oma-build-*')), [])


if __name__ == '__main__':
    unittest.main()
