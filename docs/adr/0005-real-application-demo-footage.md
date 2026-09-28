# ADR 0005: Demonstrate features using actual application captures

- Status: Accepted
- Recorded: 2026-09-28
- Scope: Product evidence and promotional media

## Context

The first promotional cut redrew O.M.A.'s face and illustrated application workflows.
The user requested actual application images and video instead of invented screens.
A convincing animation can otherwise imply behavior the application did not perform.

## Decision

Capture the running O.M.A. application and real target applications for feature
sequences. Use actual application rendering for its on-screen appearance, rather
than replacing it with a separately drawn approximation. Keep original recordings
as evidence and edit copies for the promotional cut.

Singing or musical staging may be an artistic sequence, but must remain distinct
from a demonstrated product capability. If lip motion is driven for a staged
performance, do not imply that autonomous singing is an implemented user feature.
Do not pass mocked tool results, fictional screens or simulated workflows off as
real operations. Disclose synthesized commands and time compression when used.

Use a prepared workspace and non-private sample content. If real capture is blocked,
report the blocker; do not silently substitute generated footage. Do not label a
capture page or recording plan as a completed recording.

## Alternatives

- Redraw the UI for convenience: fails the requirement to show the actual product.
- Use fixture screenshots as operation evidence: fixtures can test rendering but
  do not establish that an agent performed a task.
- Record the ordinary working desktop indiscriminately: risks including unrelated
  personal content and makes reproducible demonstrations harder.

## Consequences

Recording requires a working app, a suitable workspace and capture access.
Promotional editing takes longer than rendering an illustration. Keep historical
or staged material labeled, and distinguish a real operation's waiting time from
an edited presentation of that operation.

## References

- [Historical recording notes](../DEMO-RECORDING.md)
- [Demo script](../DEMO-SCRIPT.md)
