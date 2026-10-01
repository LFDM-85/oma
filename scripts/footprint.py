#!/usr/bin/env python3
"""Report logical file bytes without modifying Git, installations or user data."""
import argparse
import fnmatch
import json
from pathlib import Path
import subprocess

parser = argparse.ArgumentParser()
parser.add_argument('--baseline', default='before-gpt-live-only-2026-09-29')
parser.add_argument('--baseline-node-modules', type=Path)
args = parser.parse_args()
root = Path(__file__).resolve().parent.parent


def git(*command):
    return subprocess.check_output(['git', '-C', str(root), *command])


def totals(paths):
    files = [p for p in paths if p.is_file() and not p.is_symlink()]
    return {'files': len(files), 'bytes': sum(p.stat().st_size for p in files)}


before = {}
for entry in git('ls-tree', '-rlz', args.baseline).split(b'\0'):
    if entry:
        metadata, name = entry.split(b'\t', 1)
        before[name.decode()] = int(metadata.split()[-1])
current = {name.decode() for name in git('ls-files', '--cached', '--others', '--exclude-standard', '-z').split(b'\0') if name}
# Reproduce the historical install-local root QML glob over the snapshot tree.
# Current nested QML is counted via runtime-files.txt below, not these old globs.
patterns = ['*.qml', 'runtime/*.mjs', 'runtime/*.py', 'scripts/*', 'native/*',
            'docs/*.md', 'assets/*', 'skills/*/SKILL.md', 'skills/*/scripts/*.mjs']
old_payload = {name: size for name, size in before.items() if name in ['package.json', 'package-lock.json', '.npmrc'] or any(name.count('/') == pattern.count('/') and fnmatch.fnmatchcase(name, pattern) for pattern in patterns)}
# The generated native executable is excluded on both sides; it is reported separately.
new_payload = [root / name for name in (root / 'scripts/runtime-files.txt').read_text().splitlines() if name != 'runtime/oma-pointer']
before_lock = json.loads(git('show', args.baseline + ':package-lock.json'))
after_lock = json.loads((root / 'package-lock.json').read_text())
report = {
    'baseline': args.baseline,
    'source_before': {'files': len(before), 'bytes': sum(before.values())},
    'source_after': totals(root / name for name in current),
    'payload_before_without_dependencies_or_pointer': {'files': len(old_payload), 'bytes': sum(old_payload.values())},
    'payload_after_without_dependencies_or_pointer': totals(new_payload),
    'lock_packages_before': len(before_lock['packages']) - 1,
    'lock_packages_after': len(after_lock['packages']) - 1,
    'node_modules_after': totals((root / 'node_modules').rglob('*')),
    'generated_pointer': totals([root / 'runtime/oma-pointer']),
}
if args.baseline_node_modules:
    report['node_modules_before'] = totals(args.baseline_node_modules.rglob('*'))
print(json.dumps(report, indent=2))
