# Qwen3.5 4B development, v41

Japanese 13/15 and English 14/15, zero critical errors. Restricting comparison
to the original 13 tasks gives 12/13 in each language; the added rename/replace
cases are not used to inflate the earlier denominator. Both rename cases passed.
Japanese failed unwanted append characters and edit schema validation. English
failed to discard and close after repeated inaccurate dialog clicks; the editor
remained open with the draft. This is not final acceptance.

The Japanese replacement trace reveals nested input.edits with a top-level path,
which the extra literal-input wrapper rejects. The native Pi edit schema already
contains edits[] JSON objects. A later candidate removes only this redundant
wrapper; that fix is absent from v41. File-writing and appending still need their
literal-text wrappers. All observations and 68 verified raw trace files are
retained, with environment, memory, source/harness hashes and full checks.
