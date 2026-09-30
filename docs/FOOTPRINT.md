# GPT-Live-only footprint

Measured on 2026-09-29 against
[`before-gpt-live-only-2026-09-29`](https://github.com/komagata/oma/tree/before-gpt-live-only-2026-09-29)
(commit `42e5e1a9b826d61080ea854127fc1a632f70866b`). Values are logical file bytes,
not filesystem allocated blocks, compressed transfer size, RSS or latency.

| Measurement | Before | After | Reduction |
| --- | ---: | ---: | ---: |
| Source files | 1,960 |         194 | 90.1% |
| Source bytes | 62,986,939 |   4,684,628 | 92.6% |
| Runtime payload files, excluding dependencies/native executable | 123 | 73 | 40.7% |
| Runtime payload bytes, same exclusions | 1,759,587 | 1,423,246 | 19.1% |
| node_modules bytes | 423,670,662 | 20,038,864 | 95.3% |
| Runtime payload + node_modules bytes, excluding native executable | 425,430,249 | 21,462,110 | 95.0% |
| Lockfile dependency entries, excluding root | 146 | 2 | 98.6% |

Source includes all remaining tracked files plus the new files in this patch,
including docs and authoring assets. Removed tracked files, `.git`, node_modules
and ignored generated files are excluded. In particular, the 2,840,784-byte Blender
face source remains maintainable in Git, together with face/CRT source and builders.
It is absent from the runtime payload.

The runtime payload is the content-hashed local installer build, not the entire
Git checkout or a registry tarball. The compiled pointer adds 17,360 bytes and one
file on this host; it is excluded on both sides of the table. The plugin root also
holds its manifest/README/license/package metadata. Each build has its own
node_modules. No cross-build writable dependency sharing or old-build deletion
was introduced.

The baseline node_modules measurement was read from the existing original checkout
with an identical lockfile. A clean baseline offline install could not finish
because the Pi TUI tarball was not cached (`ENOTCACHED`). After removal, a clean
production install and a separate actual staged install both completed from the
cache with install scripts and bin links disabled. Remaining versions are
OpenAI 7.23.0 and ws 8.21.3; no Pi packages remain in the lock or installation.

Reproduce the measurements from this checkout:

```sh
python3 scripts/footprint.py
# Optional read-only comparison with the preserved dependency directory:
python3 scripts/footprint.py --baseline-node-modules /path/to/previous/node_modules
npm ci --omit=dev --ignore-scripts --bin-links=false --offline
```

The helper reads the snapshot tree directly for source and old installer selection,
and the current explicit `scripts/runtime-files.txt` for the new payload. It never
writes Git, installs packages, or scans user model/cache directories.

The main reductions come from removing the Local/Pi pipeline and model setup,
model-comparison/evaluation tools, historical benchmark copies, and generated
preview/promo output. They remain recoverable from the snapshot. Existing Git
objects/history, prior installed builds, downloaded user models, credentials,
SQLite memory/transcripts and external user-generated output were not removed.
See [verification](VERIFICATION.md) for checks and sandbox limitations.
