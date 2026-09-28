# Qwen3.5 4B development, v46

Japanese 14/15 and English 14/15, zero critical errors. All 30 observations and
68 verified trace files are retained. Native edit, rename and multiline append
passed in both languages in this run. Japanese failed an arithmetic task.
English explicit discard chose cancel_application_close, then a desktop click,
and left the document open. It did not enter binary approval. The guard therefore
addresses the approval failure but does not guarantee correct action selection.

Full checks: 264 Node, Python 7/19/19, QML 39/3/3. This is development evidence,
not final acceptance. Sampled RSS, device VRAM and model allocation are reported
separately in memory-summary.json; no exact unsampled peak is claimed.
