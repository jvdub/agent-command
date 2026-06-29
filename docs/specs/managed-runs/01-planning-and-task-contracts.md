# Planning and Task Contracts

Status: Approved specification

## Planning lifecycle

1. The user creates a Managed Run from a written story, bug, or imported artifact.
2. Agentic Command opens an interactive shaping session using a capable planning model.
3. The user may use `/grill-me` or an equivalent guided specification workflow.
4. The planning worker inspects the repository and produces a structured plan without editing files.
5. Agentic Command presents the plan for editing and explicit approval.
6. Execution remains blocked until the user approves the current plan revision.

Planning is intentionally collaborative. The scheduler must not infer approval from terminal output or start execution merely because a planning process exited successfully.

## Plan contract

A plan must contain:

- Mission objective.
- Constraints and explicit non-goals.
- Mission-wide success criteria.
- Ordered task contracts.
- Known risks and unresolved questions.
- Final integration verification guidance.
- Plan revision and approval metadata.

## Task contract

Each task must contain:

- Stable task ID.
- Title and bounded objective.
- Observable success criteria.
- Dependencies on other task IDs.
- Relevant repository scope when known.
- Implementation capability tier.
- Verification capability tier.
- Suggested verification commands or behaviors.
- Maximum implementation attempts, defaulting to three total attempts: the initial attempt plus two retries.
- Context notes required by the worker.
- Status and attempt history.

Tasks should be independently executable after their dependencies complete. A task that is too broad to verify independently must be split or explicitly marked for human approval.

## Approval and revision

- Approval records the plan revision, timestamp, and user action.
- Editing an approved plan creates a new unapproved revision.
- Material plan changes pause execution until the new revision is approved.
- Completed task evidence remains attached when replanning, but the user decides whether completed tasks remain accepted.
- The planning worker cannot approve its own plan.

## Planning output validation

The provider adapter must return a structured plan outcome. Agentic Command validates required fields, dependency references, unique task IDs, and the absence of dependency cycles before offering approval.

Malformed or incomplete output is shown to the user and may be retried, edited manually, or replaced by another planning worker.
