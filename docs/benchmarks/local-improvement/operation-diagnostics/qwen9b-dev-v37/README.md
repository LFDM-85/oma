# Qwen3.5 9B development comparison, v37

This is a development matrix, not final acceptance. The same v37 runtime uses
Qwen3.5:9b, low thinking, temperature 0.2, top_p 1 and presence penalty 0.
Japanese passed 13/13, English 11/13; zero critical errors. App language was
switched for each language. All 26 observations remain in results.json.

English discard timed out after 150.932 s. The target was Don't Save, but the
visual click hit Save, opened Save As, and retried. The saved observation shows
the small neighboring labels; tool arguments/results are in verified traces.
English goodbye replied verbally without requesting end_conversation. Its
extended utterance did not match the conservative direct farewell route.
Neither failure is excluded or reclassified as success.

Successful median latency was 26.529 s Japanese / 23.740 s English; maxima
83.070 / 47.715 s. Memory sampling recorded 496 samples, zero errors, runner
peak RSS 6,081,084 KiB. Whole-device VRAM peaked at 7,349 MiB (includes desktop).
Ollama reported model allocation 7,242,220,826 bytes, including 4,481,477,507 on
GPU. Only 21/34 layers were offloaded to GPU; the rest used CPU. This model is
not adopted as the default based on this development result.

Run selected-agent.py with --source pointing to the extracted archived source,
--model qwen3.5:9b --thinking low --temperature .2 --top-p 1
--presence-penalty 0 --split dev --repeat 1 --output a-new-directory.
Stage the matching O.M.A. build and read-only editor observer first, and set
OMA_EVALUATION_EDITOR_INSPECTION=1. The full commands and staging procedure are
in tests/voice/evaluation/README.md. Source/harness hashes are verified against
the included archive; previous user preferences were restored by the wrapper.
