# Task 06: Build the Workflow Journey

## Objective

Replace the flat task list with a visual journey that communicates goal progress, dependencies, current phase, verification, retries, and final integration state at a glance.

## Context

Managed Runs are durable goals orchestrated locally. Each task attempt is intended to be a bounded one-shot prompt followed by independent verification. The journey must express that loop without representing verification as a separate global execution chain.

## Scope

- Add a dedicated journey renderer using the shared projections.
- Render plan/approval gates when relevant, approved task stations, dependency connectors, and final integration verification.
- Render implementation and verification as phases inside each task station.
- Render failed-verification retry loops and attempt counts.
- Support linear and deterministic branched dependency layouts without freeform positioning.
- Add selected, focused, active, blocked, attention, completed, failed, cancelled, and replan states.
- Add keyboard selection, meaningful accessible names, reduced-motion support, and color-independent cues.
- Preserve selected station across run-change updates.
- Keep existing dashboard sections available temporarily until inspector parity is complete.

## Likely files

- New `src/renderer/managedRunJourney.js`
- `src/renderer/managedRunsView.js`
- `src/renderer/index.html`
- `src/renderer/styles.css`
- New journey/layout tests and fixtures

## Non-goals

- Do not add drag positioning or a graph library.
- Do not estimate model-generated percent completion.
- Do not remove existing controls or evidence views yet.

## Acceptance criteria

- Current task, current phase, verified progress, blocked work, retries, and required attention are evident without opening the inspector.
- Verification appears within each task's lifecycle.
- A retry visibly connects a failed verification to the next implementation attempt.
- Final integration verification is a terminal mission-level station.
- Linear and branched plans remain understandable.
- Pointer and keyboard users can select every station.
- Live output streaming does not rebuild the journey DOM.

## Required tests

- Layout/projection fixtures for linear, branch, retry, blocked, review, replan, final, completed, and cancelled states.
- Selection persistence across run updates.
- Keyboard and accessible-label behavior.
- Reduced-motion behavior.
- Dark/light and desktop/narrow visual fixtures.

## Dependencies

- Tasks 01 and 02.

