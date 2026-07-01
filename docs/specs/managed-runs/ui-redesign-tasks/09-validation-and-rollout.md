# Task 09: Complete End-to-End Validation and Remove the Legacy Dashboard

## Objective

Prove the new Managed Runs experience across lifecycle, persistence, security, accessibility, performance, themes, and viewport sizes, then remove temporary legacy UI.

## Context

The redesign spans persistence, IPC, scheduler evidence, editor integration, and renderer behavior. Final validation must demonstrate that the goal workflow is clearer without weakening existing safety or human controls.

## Scope

- Add deterministic fixtures for all significant lifecycle states.
- Add full-flow tests for planning, approval, execution, verification, retry, review, replan, final verification, acceptance, archive, and restart recovery.
- Verify exact prompts for initial and retry attempts.
- Verify affected-file opening and repository containment.
- Verify inbox behavior and normal-session non-regression.
- Test long plans, long prompts, long paths, and high-volume output.
- Verify selection/focus/scroll stability during run and worker-output events.
- Validate dark/light themes, desktop/narrow windows, keyboard use, reduced motion, and non-color status cues.
- Measure/guard against whole-view rerenders during streaming output.
- Run all project checks and perform a manual Electron smoke test.
- Remove the old Managed Runs card layout and temporary feature flag only after parity is proven.
- Update Managed Runs specifications or README documentation where behavior changed.

## Likely files

- Managed Run service, renderer, integration, and E2E tests
- Visual fixture/screenshot infrastructure
- `src/renderer/index.html`
- `src/renderer/styles.css`
- Managed Runs documentation

## Non-goals

- Do not add the spatial alternate view.
- Do not broaden into scheduler parallelism or publication automation.
- Do not accept known failures by weakening assertions.

## Acceptance criteria

- The full test suite and static checks pass.
- Manual Electron smoke testing confirms the complete workflow.
- Exact prompt inspection remains lazy and secure.
- File opening remains contained to the run repository.
- No lifecycle control or evidence available in the old UI is lost.
- Normal interactive sessions have no functional or visual regression.
- Legacy Managed Runs dashboard markup/styles and temporary flags are removed.

## Required validation commands

- `npm.cmd run check`
- Focused Jest suites for changed services and renderer modules
- Full Jest suite using the repository's configured command
- Available Playwright/E2E command
- Manual Electron run in dark/light and desktop/narrow modes

Record any environment-specific inability to run a command rather than claiming it passed.

## Dependencies

- Tasks 01 through 08.

