# Task 01: Separate Approved Task Definitions from Runtime State

## Objective

Create an immutable, definition-only approved plan snapshot so the UI can truthfully compare the task approved by the user with the exact prompts later sent to workers.

## Context

`run.plan.tasks` and `run.tasks` currently share object references. Scheduler mutations to task status and attempts can alter the apparent approved plan record. This task establishes historical truth before the new UI consumes it.

## Scope

- Add helpers that clone definition-only plan and task fields.
- Add an approved snapshot with revision, approval time, definition fields, and provenance.
- Ensure runtime tasks are separate objects from approved definitions.
- Invalidate the snapshot when the plan changes.
- Require a matching approved snapshot before execution starts.
- Bump the persisted schema and add backward-compatible migration.
- Mark migrated historical snapshots as best-effort when original pristine definitions cannot be proven.

## Likely files

- `src/main/services/managedRunUtils.js`
- `src/main/services/managedRunService.js`
- `src/main/services/managedRunPersistenceService.js`
- Corresponding service and persistence tests

## Non-goals

- Do not redesign the renderer.
- Do not change scheduler transitions or retry policy.
- Do not expose worker prompts.

## Acceptance criteria

- Approving a plan creates a definition-only snapshot tied to that revision.
- Runtime status and attempt changes do not mutate the snapshot.
- Editing or regenerating a plan invalidates approval as before.
- Execution rejects missing or stale approval snapshots.
- Current persistence records load without data loss.
- Migration does not falsely label reconstructed historical definitions as exact.

## Required tests

- Object identity and mutation regression test.
- Approval, edit, reapproval, and start guards.
- Persistence round-trip for the new schema.
- Migration fixtures for approved, unapproved, active, and completed older runs.

## Dependencies

None.

