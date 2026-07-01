# Task 03: Add Secure Exact-Prompt Inspection

## Objective

Allow the user to inspect the exact immutable prompt sent to each implementation and verification worker without exposing all prompts in broad renderer payloads.

## Context

Worker prompts are already captured and encrypted at rest, but `summarizeRun()` removes them before renderer delivery. Retries receive different prompts because attempt number and verification feedback change. Historical prompts must never be reconstructed for display.

## Scope

- Record attempt number, prompt kind, template version, creation time, and approved definition revision on workers.
- Add a service method and narrow IPC operation to fetch one worker's protected detail by run ID and worker ID.
- Validate worker ownership by the requested run.
- Add preload and renderer API wrappers.
- Preserve prompt redaction in run lists, run-change broadcasts, and ordinary summaries.
- Return explicit prompt availability states when secure storage could not persist or restore text.
- Ensure prompt text is not included in errors, diagnostics, or audit messages.

## Likely files

- `src/main/services/taskSchedulerService.js`
- `src/main/services/managedRunService.js`
- `src/main/services/managedRunPersistenceService.js`
- `src/main/ipc/registerManagedRunIpcHandlers.js`
- `src/shared/ipcContract.js`
- `src/preload.js`
- `src/renderer/agenticApp.js`
- Corresponding tests

## Non-goals

- Do not render the final inspector.
- Do not regenerate or summarize prompts with a model.
- Do not put prompt text directly on task records.

## Acceptance criteria

- A validated detail request returns the exact stored prompt for one worker.
- Initial implementation, retry implementation, task verifier, and integration verifier prompts are distinguishable.
- Later plan edits and prompt-template changes do not alter stored historical prompts.
- Broad run payloads remain prompt-free.
- Missing protected text is shown as unavailable with a reason, not as a misleading blank prompt.

## Required tests

- Service ownership validation.
- IPC and preload contract coverage.
- Prompt redaction regression tests.
- Restart round-trip with secure storage available.
- Explicit unavailable state when secure storage is unavailable.
- Distinct prompts for initial and retry attempts.

## Dependencies

- Task 01 for approved definition revision metadata.
- Task 02 for the worker-detail contract.

