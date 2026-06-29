# Scheduler and State Machine

Status: Approved specification

## Responsibility

The scheduler owns ordinary Managed Run transitions. It launches workers, records outcomes, applies retry limits, respects dependencies, and determines when human input is required.

The scheduler never edits repository files and never asks an LLM to decide transitions that are already determined by state.

## Run states

- `draft`: mission exists but shaping is incomplete.
- `planning`: a planning worker is active.
- `approval_required`: a plan or material revision awaits the user.
- `ready`: the approved plan can execute.
- `running`: an implementation or verification worker is active.
- `paused`: no new worker may start.
- `replan_required`: task evidence indicates a plan defect or scope change.
- `final_verification`: mission-wide integration verification is active.
- `review_required`: execution stopped for human judgment or final review.
- `completed`: the user accepted the final result.
- `cancelled`: the user ended the run.
- `failed`: the scheduler cannot safely continue.

## Task states

- `planned`
- `blocked_by_dependency`
- `implementing`
- `awaiting_verification`
- `verifying`
- `retry_required`
- `replan_required`
- `human_review_required`
- `succeeded`
- `cancelled`
- `failed`

## Deterministic transition rules

1. Only an approved plan revision can enter `ready`.
2. The scheduler selects the first executable task whose dependencies succeeded.
3. A successful implementation process produces `awaiting_verification`, not `succeeded`.
4. Every implementation attempt launches an independent verifier.
5. A passing verifier marks the task `succeeded`.
6. A fixable failure starts another implementation attempt with verification feedback when attempts remain.
7. Exhausted attempts require human review or replanning.
8. Plan defects enter `replan_required` immediately.
9. Final integration verification begins only after every task succeeds.
10. A Managed Run is not `completed` until final evidence is presented and accepted by the user.

## Local-model boundary

A local or inexpensive model may:

- Summarize worker output.
- Classify verification failures using a fixed schema.
- Recommend a capability tier.
- Detect likely ambiguity, looping, or scope drift.
- Prepare concise status reports.

It may not:

- Edit files.
- Launch arbitrary commands.
- Bypass approval, dependency, retry, or permission rules.
- Mark a task or run successful without verifier evidence.
- Commit, push, publish, delete files, or open pull requests.

All local-model output is advisory or schema-constrained and passes deterministic validation.

## Concurrency and repository lock

The MVP permits one active implementation or verification worker per Managed Run and one editing Managed Run per working tree. Read-only interactive sessions may remain open.

Parallel task execution and isolated Git worktrees are deferred until after the serial workflow is reliable.

## Recovery

State is persisted before and after every worker launch and transition. On restart, an in-flight worker with no live process is marked interrupted and requires retry or human review; it is never assumed successful.
