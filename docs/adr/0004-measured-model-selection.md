# ADR 0004: Measure speech models and retain human listening judgments

- Status: Accepted
- Recorded: 2026-09-28

## Context

STT, reasoning and TTS have different failure modes. Japanese kanji readings can
be ambiguous, and an ASR reading back generated speech can itself be wrong.
Automated scores cannot establish naturalness or what a listener actually hears.

## Decision

Evaluate recognition, reasoning, synthesis and end-to-end operations separately.
Compare candidates on fixed data and record model/configuration identities,
environment, raw outputs, failures, latency and resource use. Report accuracy,
speed and memory separately. Distinguish synthetic input from actual recordings
and tuning data from final evaluation data. English application scenarios must
also select English in the app.

For TTS reading evaluation, retain proposed readings and allow humans to confirm,
correct or mark them uncertain, then listen and score the audio. Keep those
judgments separate from automatic recognition proxies. Unreviewed or uncertain
items are not passes. A reference change requires prior audio judgments to be
rechecked. Do not claim human evaluation has happened merely because a review
page or automated metric exists.

Use evidence to choose models; do not make a Japanese-specialized model the
all-language standard based only on Japanese results. Numeric targets and current
model choices belong in versioned evaluation plans and reports, not this ADR.

## Alternatives

- Choose by reputation alone: does not measure this hardware and these tasks.
- Use ASR readback as ground truth: confounds TTS and recognizer errors.
- Match expected tool calls only: misses failed actions and serious misoperations.
- Remove failures from evaluation: inflates success rates and prevents fair comparison.

## Consequences

Listening takes human time. Missing real recordings or human judgments remain
explicit limitations, not successful completion. Benchmarks need reproducible
commands and frozen inputs; model changes require regression evaluation.

## References

- [Evaluation documentation](../../tests/voice/evaluation/README.md)
- [Japanese reading methodology](../../tests/voice/evaluation/READINGS.md)
- [Reading comparison report](../benchmarks/2026-09-27-japanese-readings/README.md)
