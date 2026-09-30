"""Exercise immutable packaging without installing or reloading the user's plugin."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parent.parent


class PackageTest(unittest.TestCase):
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
            first = target / Path(manifest['entryPoints']['service']).parent
            actual = {str(p.relative_to(first)) for p in first.rglob('*') if p.is_file() and 'node_modules' not in p.parts}
            self.assertEqual(actual, set(files))
            (first / 'node_modules/fixture').write_text('old immutable dependencies')
            self.assertEqual(build().returncode, 0)
            self.assertEqual((first / 'node_modules/fixture').read_text(), 'old immutable dependencies')
            (source / 'Settings.qml').write_text((source / 'Settings.qml').read_text() + '\n// New build\n')
            self.assertEqual(build().returncode, 0)
            second = target / Path(json.loads((target / 'manifest.json').read_text())['entryPoints']['service']).parent
            self.assertNotEqual(first, second)
            self.assertEqual((first / 'node_modules/fixture').read_text(), 'old immutable dependencies')
            self.assertEqual((second / 'node_modules/fixture').read_text(), 'installed')
            self.assertFalse((second / 'node_modules').is_symlink())
            before = (target / 'manifest.json').read_bytes()
            (work / 'fail').touch()
            (source / 'Settings.qml').write_text('failed build fixture')
            self.assertNotEqual(build().returncode, 0)
            self.assertEqual((target / 'manifest.json').read_bytes(), before)
            self.assertEqual(len(list((target / 'builds').iterdir())), 2)
            self.assertEqual(list(work.glob('oma-build-*')), [])


if __name__ == '__main__':
    unittest.main()
