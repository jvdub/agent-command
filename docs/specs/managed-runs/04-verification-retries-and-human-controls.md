# Verification, Retries, and Human Controls

Status: Approved specification

## Per-attempt verification

Every implementation attempt is followed by a separate read-only verification worker. Implementation process exit code zero is not evidence that the task succeeded.

The verifier evaluates:

- The task's observable success criteria.
- The current working-tree diff and relevant unchanged context.
- Focused tests, typechecks, linters, or manual checks.
- Scope control and unrelated changes.
- Remaining risks and uncertainty.

## Verification outcome

The verifier returns a structured outcome containing:

- `verdict`: `pass`, `fix_required`, `plan_defect`, `human_decision_required`, or `environment_blocked`.
- Evidence and checks executed.
- Failed criteria.
- Actionable implementation feedback.
- Risks and unverified areas.
- Recommended capability tier, if escalation may help.

Raw output is retained, but scheduler transitions use the validated structured outcome.

## Retry policy

- A task receives one initial implementation attempt and up to two retries by default.
- A retry packet includes the task contract and latest actionable verification feedback.
- Earlier full transcripts are not forwarded automatically.
- The user may change the retry limit before execution or while paused.
- Exhausting the limit results in human review, not an unbounded loop.
- A model-tier escalation is a new attempt and consumes the retry budget unless the user explicitly grants an additional attempt.

## Replanning and escalation

- `fix_required`: retry when attempts remain.
- `plan_defect`: pause execution and request plan revision.
- `human_decision_required`: request a specific user decision.
- `environment_blocked`: surface diagnostics and allow retry after correction.
- Repeated malformed worker outcomes: stop and require human review.

The local model may classify ambiguous raw evidence into this schema, but deterministic guards and user overrides remain authoritative.

## Final integration verification

After all tasks pass, a separate capable worker verifies the mission as a whole. It checks:

- Mission-wide success criteria.
- Cross-task interactions and regressions.
- The complete diff.
- Relevant broader test suites.
- Unrelated or suspicious changes.
- Remaining operational and review risks.

A passing final verifier moves the run to `review_required`. Only the user can accept it as `completed`.

## Human controls

The user can always:

- Pause before the next worker launches.
- Cancel the run or an active worker.
- Retry an interrupted or failed step.
- Change provider, tier, or resolved model for a future attempt.
- Edit task state with confirmation and an audit event.
- Revise the plan and invalidate approval.
- Accept or reject verifier conclusions.
- Open any worker output and inspect repository changes.
- Take over manually in an interactive session.

Pause prevents new transitions. Cancellation behavior for an active process must be explicit and must never be represented as a successful result.
