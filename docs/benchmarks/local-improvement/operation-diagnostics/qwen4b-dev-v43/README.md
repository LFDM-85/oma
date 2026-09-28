# Qwen3.5 4B development, v43

Japanese 14/15, English 14/15, zero critical errors. The original 13-task subset
is 12/13 in each language; both added rename/replace cases pass. Native edit
arguments now succeed in both languages without reconstructing the file.
Japanese still inserted unwanted literal backslash-n during multiline append;
English again entered binary approval after an explicit discard choice. Skill
wording alone has not reliably eliminated that repeated confirmation.

All 30 observations and 68 verified trace files are retained. Full checks passed:
259 Node tests, Python 7/19/19, QML 39/3/3. This development result is not final
acceptance. A later candidate checks actual pending document-modal state before
allowing binary approval; that runtime guard is not present in v43.
