# Task 04: Normalize Attempt Evidence and Audit Context

## Objective

Store structured, attempt-specific evidence that the new inspector can present without reparsing terminal output in the renderer.

## Context

Implementers are required to end with JSON containing summary, changed files, checks, and risks, but this result is not currently normalized. Existing Git changed-file data is an after-only working-tree snapshot and may include earlier or unrelated changes.

## Scope

- Parse the implementer's required JSON once after completion.
- Store summary, reported files, checks, risks, parse status, and parse error metadata while preserving raw output.
- Normalize repository-relative paths and reject unsafe path forms for actionable links.
- Capture before/after Git name-status evidence where practical.
- Keep worker-reported and Git-observed files separate with attribution labels.
- Extend run event detail with optional task, attempt, worker, phase, verdict, and human-override context.
- Keep older records readable when normalized artifacts or event context are absent.

## Likely files

- `src/main/services/taskSchedulerService.js`
- `src/main/services/workerProcessService.js`
- `src/main/services/managedRunUtils.js`
- `src/main/services/managedRunPersistenceService.js`
- Scheduler, worker, utility, and persistence tests

## Non-goals

- Do not claim exact causality from cumulative Git state.
- Do not remove raw stdout/stderr.
- Do not change verification verdict policy.

## Acceptance criteria

- Successful structured output produces normalized evidence tied to the correct attempt/worker.
- Malformed output remains inspectable and has an explicit parse-failure state.
- Reported and observed file lists remain distinguishable.
- Events can be filtered reliably by task and attempt when context is available.
- Scheduler behavior is unchanged.

## Required tests

- Valid and malformed implementation output.
- Retry attempts with independent evidence.
- Unsafe/absolute/traversal path normalization.
- Before/after Git evidence with pre-existing changes.
- Event context persistence and historical fallback.

## Dependencies

- Task 01 for immutable definition references.
- Task 02 for normalized view shapes.

