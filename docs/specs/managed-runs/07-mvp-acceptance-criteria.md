# MVP Acceptance Criteria

Status: Approved specification

## Deliverable

The MVP provides a complete serial Managed Run from interactive planning through per-task implementation and verification, final integration verification, and human acceptance.

## Functional acceptance

1. A user can create a Managed Run from a story, bug, or written specification.
2. A non-Git target prompts for explicit Git initialization; approval runs `git init` locally and cancellation leaves the folder unchanged.
3. A capable read-only planning worker can produce a validated structured plan.
4. The user can edit and explicitly approve the plan.
5. Execution cannot start from an unapproved or superseded revision.
6. Each task identifies implementation and verification capability tiers.
7. Agentic Command resolves each tier to a provider and model and shows the command preview.
8. A non-default resolved model is passed to the coding CLI using `--model <resolved-model>`.
9. An implementation worker can edit the repository but cannot publish or perform destructive actions.
10. Every implementation attempt is followed by an independent read-only verifier.
11. A fixable verifier failure can trigger a bounded retry with compact feedback.
12. Two failed retries after the initial attempt stop for human review by default.
13. Plan defects and ambiguous decisions stop for replanning or human input.
14. All successful tasks trigger a separate final integration verification.
15. Final success requires human acceptance.
16. The user can pause, resume, cancel, retry, override future routing, revise the plan, and inspect every attempt.
17. An interrupted app or worker does not produce a false success state.
18. Conflicting implementation workers cannot edit the same working tree concurrently.
19. Run, task, worker, evidence, and usage state survives an application restart subject to protected-storage policy.

## Quality acceptance

- Scheduler transition tests cover success, retry, replanning, cancellation, interruption, and exhausted-attempt paths.
- Provider adapter contract tests cover permissions, structured outcomes, cancellation, and model designation.
- A test proves `--model` is omitted for a configured default and supplied for a non-default model.
- IPC contract synchronization and preload security checks pass.
- Output and machine-context buffers are bounded.
- Persistence tests cover schema versioning, atomic recovery, and unavailable protected storage.
- Token ledger tests preserve known values and represent unavailable values explicitly.
- Existing interactive PTY workflows continue to pass regression tests.
- The complete repository check, unit-test, and relevant end-to-end suites pass.

## Required demonstration scenarios

- One-task mission that passes implementation and verification immediately.
- Task that fails verification once, receives feedback, and passes on retry.
- Task that exhausts retries and requests human action.
- Verification that identifies a plan defect and returns to planning.
- Mixed-tier mission where at least one non-default model is launched with `--model`.
- Interrupted worker recovery after application restart.
- User pause and model override before the next attempt.
- Multi-task mission that passes final integration verification and produces a complete report.

## Deferred beyond MVP

- Parallel task execution.
- Automatic Git worktree creation and integration.
- Fully autonomous model routing.
- Automatic commit, push, or pull-request creation.
- Remote orchestration or multi-user collaboration.
- A local model acting as an implementation worker.
