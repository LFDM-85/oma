# Original voice baseline v50: stopped for filesystem isolation gap

This run is **not a completed final matrix**. Japanese has 10 passed, 2 failed,
and 18 raw not_run slots; English has 30 not_run. One Japanese modes slot was
partly executed and externally interrupted during farewell, so its raw not_run
status does not mean it was unattempted. The interruption is recorded separately.
No raw result was overwritten or counted as successful.

During Japanese document repeat 1, the baseline assistant failed to use OmaText
and invoked native `write` for `/home/komagata/Projects/test.txt`. This exposed a
harness gap: a separate desktop workspace does not isolate filesystem writes.
The file was newly created (birth timestamp matches the recorded write; the native
tool uses non-atomic fs.promises.writeFile). Its exact synthetic contents and hash
are preserved here. After verifying the contents and inode, it was copied to the
artifact directory, verified, and removed from the original location.

The matrix was interrupted, future queued operation/voice runs were cancelled,
and ordinary settings plus the current evaluation build were restored. The
incident is a failure of isolation, not an external blocker or a passing result.
New voice runs require a fresh private data/workspace and a read-only worker
filesystem for both baseline and candidate. Desktop IPC remains real/shared;
that limitation is explicit and unrelated-window/document guards still apply.
See isolation-incident.json and the unchanged trial archive for evidence.
