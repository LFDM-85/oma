# Startup sound attribution

`startup.pcm` is adapted from **TV-Degauss01-4(Short)** by **OtoLogic**.

- Source: https://otologic.jp/free/se/television01.html
- License: Creative Commons Attribution 4.0 International (CC BY 4.0)
- License text: https://creativecommons.org/licenses/by/4.0/
- Creator's terms: https://otologic.jp/free/license.html

Changes: lowered pitch one octave; removed high frequencies; boosted bass;
shortened and faded out; normalized peak; removed initial 120 ms and added a
100 ms fade-in to remove the switch click. Converted to 24 kHz mono signed
16-bit little-endian PCM. Final duration: 1.23 seconds.

The O.M.A. software license does not replace this sound's CC BY 4.0 license.

## Face assets

The face texture was AI-generated for this project. The mesh, shape keys and
Blender authoring scripts were created for O.M.A. They are distributed under
the repository MIT license. Blender is an optional authoring tool, not a runtime
dependency.

## Runtime and protocol dependencies

The OpenAI SDK and ws are Apache-2.0 and MIT licensed, respectively.
npm dependencies retain their upstream licenses
in their installed packages; exact versions are recorded in `package-lock.json`.
The Wayland virtual-pointer protocol
retains its upstream copyright and license in `native/wlr-virtual-pointer-unstable-v1.xml`.

## CRT glass shader

`crt.frag` is original O.M.A. code under the repository MIT license.
`crt.frag.qsb` is the bundled Qt shader package. Regenerate it with
`scripts/build-shaders` using Qt Shader Tools; runtime installation does not
require the compiler.
