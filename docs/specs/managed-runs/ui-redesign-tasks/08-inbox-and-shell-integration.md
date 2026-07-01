# Task 08: Add the Managed Runs Inbox and Integrate the New Shell

## Objective

Compose the Managed Runs inbox, run header, workflow journey, task inspector, plan controls, and audit access into the final responsive surface.

## Context

The inbox applies only to locally orchestrated Managed Runs, where work can continue without the user watching a terminal. It is not useful for normal interactive sessions and must not appear there.

## Scope

- Add a Managed Runs attention count and inbox.
- Derive entries for approval, replan, human review, blocked/interrupted work, exhausted attempts, and final acceptance.
- Deep-link inbox selections to the correct run, task/final station, attempt, and inspector section.
- Add the goal-oriented run header and explicit current-action/progress summary.
- Compose journey and inspector into desktop and narrow layouts.
- Keep plan editing/approval, routing, usage, run audit, pause, cancel, retry, override, takeover, accept, and archive reachable.
- Move secondary controls into structured menus/panels where appropriate.
- Ensure normal sessions and their navigation are unchanged.
- Remove obsolete dashboard markup/styles only after feature parity is demonstrated.

## Likely files

- New `src/renderer/managedRunInbox.js`
- `src/renderer/managedRunsView.js`
- `src/renderer/index.html`
- `src/renderer/styles.css`
- Navigation and renderer integration tests

## Non-goals

- Do not persist read/unread state in the first version.
- Do not add an inbox to normal sessions.
- Do not maintain two permanent Managed Runs interfaces.

## Acceptance criteria

- Every authoritative state requiring user action creates a specific inbox entry.
- Entries disappear when the underlying state resolves.
- Inbox actions focus the correct evidence and control.
- The header answers current status, current action, verified progress, retries, and attention count at a glance.
- All existing lifecycle and planning capabilities remain available.
- Desktop and narrow layouts avoid nested-scroll traps and page overflow.
- Normal sessions are unchanged.

## Required tests

- Inbox categorization, priority, stable IDs, and deep links.
- Run-change updates without duplicate inbox state.
- Header progress/current-action fixtures.
- Lifecycle control parity.
- Responsive desktop/narrow behavior.
- Regression assertion that normal-session navigation has no inbox.

## Dependencies

- Tasks 02, 06, and 07.

