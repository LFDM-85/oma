# Qwen3.5 4B Q8 development, v42

Japanese 12/15, English 15/15, zero critical errors: the same success counts as
Q4 on identical source and low/.2/1/0 sampling. The original 13-case subset is
Japanese 10/13, English 13/13. Q8 passed both added rename/replace cases, but
failed Japanese math output constraints, discard timeout, and multiline append.
All failures remain; this is not final acceptance. Q8 is not selected.

| Successful-operation timing | Q4 | Q8 |
|---|---:|---:|
| Japanese median | 6.752 s | 18.970 s |
| Japanese maximum | 18.103 s | 41.465 s |
| English median | 4.536 s | 18.306 s |
| English maximum | 18.767 s | 52.868 s |

Q8's longest failed operation was 151.159 s. On this 8 GiB GPU it offloaded only
25/34 layers to GPU, versus Q4's 34/34. Peak sampled runner RSS was 4,490,316 KiB,
whole-device VRAM 7,303 MiB; Ollama total model allocation 6,812,482,924 bytes,
of which 4,701,321,951 bytes were GPU allocation. These are different measures;
RSS alone is not total model memory. 457 memory samples had zero errors.

All 30 observations, 68 verified trace files, source/harness and environment are
retained. Validation used the same frozen v42 source as the Q4 run. The comparison
ran Q4 then Q8, not counterbalanced; different successful case subsets in Japanese
also limit direct timing interpretation. The English successful sets match.
