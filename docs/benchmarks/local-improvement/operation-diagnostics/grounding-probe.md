# Development grounding probe

Input: 1440 × 810 screenshot of the native unsaved-document dialog, from a development trial. No desktop actions were executed by this probe.

Qwen3.5:9b Q4_K_M, thinking off, temperature 0. The same three button centers were requested with pixel and normalized-coordinate instructions. Pixel requests still returned normalized coordinates. For example, Don’t Save returned (463, 539), which maps to (666.72, 436.59) image pixels. Treating it as pixels clicks the wrong location.

The adapter applies only to local Qwen3.5 models. Other models and native skill operations retain pixel coordinates.

Official reference: https://github.com/QwenLM/Qwen3-VL/blob/main/cookbooks/2d_grounding.ipynb describes relative 0–1000 coordinates. Qwen3.5 clarification: https://github.com/QwenLM/Qwen3.8/discussions/56 .

The probe is development evidence, not an operation-success or final-evaluation result.
