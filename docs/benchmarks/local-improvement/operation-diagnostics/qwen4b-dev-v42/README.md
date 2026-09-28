# Qwen3.5 4B development, v42

Japanese 12/15, English 15/15, zero critical errors. The original 13-task subset
is Japanese 11/13, English 13/13; rename passed in both languages. Japanese
failures were extra math explanation, unwanted literal backslash-n on append,
and repeated edit schema errors. The native edit correction is not in this run.

This source clarifies that an explicit save/discard/cancel choice is already
authorization for that identified document. Both discard scenarios passed here;
one small development run does not prove reliability. Full validation passed.
Q4 and Q8 comparison runs share this exact source, low reasoning and .2/1/0
sampling. All observations, raw traces, hashes and sampled memory are retained.
This development result does not satisfy final acceptance.
