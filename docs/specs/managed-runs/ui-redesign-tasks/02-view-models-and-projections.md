# Task 02: Define Managed Run View Contracts and Workflow Projections

## Objective

Create explicit renderer-safe contracts and shared pure projections for run progress, journey stations, attempts, final verification, current action, and Managed Runs inbox items.

## Context

The current renderer receives a summarized run and independently interprets states in several render functions. The new inbox, journey, and inspector must use one deterministic interpretation.

## Scope

- Define explicit run-list summary, run-detail, and worker-detail shapes.
- Keep protected prompt text out of list and change-event payloads.
- Add pure projections for task phase, dependency state, attempt history, retry loops, final verification, current action, verified progress, and attention items.
- Produce stable inbox item IDs and deep-link targets.
- Support historical records with missing new fields.
- Document every scheduler task/run status mapping.

## Likely files

- `src/main/services/managedRunUtils.js`
- New renderer/shared selector module
- `src/shared/ipcContract.js` if contract helpers are introduced
- Focused unit tests

## Non-goals

- Do not build the journey UI.
- Do not add prompt retrieval or file opening.
- Do not persist inbox read/unread state.

## Acceptance criteria

- Inbox, journey, and inspector can consume the same pure projections.
- Every current run/task/verdict state has an intentional representation.
- Progress is based on verified tasks and explicit lifecycle phase.
- Branched dependencies do not imply false array-order execution.
- Normal session data and navigation remain unchanged.

## Required tests

- Linear and branched task graphs.
- Planned, blocked, implementing, awaiting verification, verifying, retry, review, replan, success, failure, and cancellation.
- Final verification pending, running, pass-awaiting-acceptance, and non-pass.
- Stable inbox IDs, priorities, and targets.
- Missing historical fields.

## Dependencies

- Task 01 for approved-definition projections.

