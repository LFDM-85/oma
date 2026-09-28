# Architecture decision records

These records explain O.M.A.'s design choices, alternatives and consequences.
Recorded on 2026-09-28 from the current implementation and agreed product direction;
the date is the documentation date, not a claim that every decision was made then.
“Accepted” describes a decision, not a claim that every behavior has passed live tests.

| ADR | Decision | Status |
| --- | --- | --- |
| [0001](0001-shell-and-worker-boundary.md) | Keep presentation in the Omarchy shell and runtime work in a Node worker | Accepted |
| [0002](0002-cloud-and-local-voice.md) | Support separate cloud and local voice paths | Accepted |
| [0003](0003-skills-and-shared-tools.md) | Put operating guidance in skills and executable behavior in shared tools | Accepted |
| [0004](0004-measured-model-selection.md) | Select speech models using reproducible measurements and human listening | Accepted |
| [0005](0005-real-application-demo-footage.md) | Use actual application captures for product demonstrations | Accepted |
| [0006](0006-continuous-desktop-context.md) | Observe bounded Hyprland metadata during conversations | Accepted |

## Maintaining records

Add a numbered record for a significant new choice. Include context, decision,
alternatives and consequences. Use Proposed until a choice is agreed; then mark it
Accepted. When a decision changes, add a new record and mark the old one Superseded
with a link. Preserve its historical rationale. Correct factual errors explicitly.

[DESIGN.md](../DESIGN.md) describes the system;
[VERIFICATION.md](../VERIFICATION.md) records verification evidence.
[PI-ARCHITECTURE.md](../PI-ARCHITECTURE.md) and
[CURRENT-ARCHITECTURE.md](../CURRENT-ARCHITECTURE.md) are historical designs,
not competing descriptions of the current default. Machine-specific selections
and benchmark scores belong in configuration and benchmark reports, not immutable
architecture decisions.
