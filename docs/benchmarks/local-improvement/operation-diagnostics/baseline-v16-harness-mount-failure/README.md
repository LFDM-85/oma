# Invalid baseline attempt: harness mount

The independent harness under `/tmp` was hidden by the sandbox private `/tmp`.
The baseline module root was mounted, but the harness was not. Node could not
load agent-turn.mjs; no model operation ran. The run was interrupted rather
than spending the remaining cases on the same infrastructure defect. All raw
rows remain, including unrun/interrupted rows. This is not a model accuracy
measurement and cannot pass acceptance. Source is the original baseline archive;
harness hashes match the v16 diagnostic source archive.

{"interrupted": 1, "failed": 12, "not_run": 187}
