# Managed Runs Workflow Journey Redesign

Status: Implemented and verified 2026-07-01

## Product framing

A Managed Run is a durable, `/goal`-like objective. Agentic Command owns the orchestration loop locally while bounded implementation and verification work is delegated to Codex, Claude Code, or another configured coding CLI.

The primary unit is therefore the goal and its auditable workflow, not a collection of worker sessions. Each implementation attempt should be designed as a one-shot task packet. The interface must make the complete translation chain inspectable:

```text
Approved goal and task contract
  -> exact implementation prompt sent for attempt N
  -> implementation output and changed-file evidence
  -> exact verification prompt
  -> verification verdict
  -> retry prompt when required
  -> verified task
```

## Objective

Replace the current card-oriented Managed Runs dashboard with a workflow journey that makes current state, progress, dependencies, verification, retries, evidence, and required human action understandable at a glance.

Selecting a task station opens a detailed inspector that combines the strongest aspect of the tile concept: dense information is available on demand without competing with the overall workflow.

## Product decisions

1. The workflow journey is the primary Managed Run view.
2. Each approved task is a station in the journey.
3. Verification is a phase inside a task attempt, not a separate global execution lane.
4. A failed verification visibly loops back to the next bounded implementation attempt.
5. Final integration verification is a mission-level terminal station.
6. Selecting a station opens a tile-style task inspector.
7. The inspector distinguishes the approved task definition from every exact prompt actually sent.
8. Affected files are clickable and open in the existing editor without creating a hidden normal session.
9. A Managed Runs inbox surfaces actionable orchestration states. Normal interactive sessions do not gain an inbox.
10. Progress uses verified task counts and explicit current-phase language. Percentages are used only when their calculation is clear.
11. The first implementation uses deterministic HTML, CSS, and SVG rather than a graph library or freeform canvas.
12. The spatial strategy-map concept remains a possible alternate view after the workflow and inspection model is proven.

## Target information architecture

### Managed Runs navigation and inbox

The Managed Runs area gains an attention count and an inbox containing only states that require user action:

- Plan awaiting approval.
- Plan defect requiring revision.
- Human decision required.
- Environment-blocked or interrupted attempt.
- Failed verification with no automatic retry remaining.
- Attempts exhausted.
- Final verification awaiting review or acceptance.

Inbox entries are derived from authoritative run state rather than persisted independently. Selecting one activates the run, selects the relevant task or final-verification station, and opens the appropriate inspector section.

### Run header

The persistent header shows:

- Goal title and repository.
- Run status and current action in plain language.
- Verified tasks out of total tasks.
- Attempts and retries used.
- Elapsed time and token usage when available.
- A primary context-sensitive action.
- Existing pause, cancel, accept, archive, takeover, plan, and routing controls.

### Workflow journey

The journey renders:

- Plan/approval as a leading lifecycle gate when relevant.
- One station per approved task.
- Dependency connectors derived from the approved plan.
- The current task and phase.
- Attempt count and latest verdict.
- Implementation and verification phases inside the station.
- Retry loops such as `Implement 1 -> Verify 1 -> retry -> Implement 2`.
- Review, replan, blocked, cancelled, and failed endpoints without collapsing them into one generic error.
- Final integration verification and human acceptance as terminal lifecycle states.

The DOM remains a meaningful ordered structure. SVG/CSS connectors are presentational and must not be the only representation of dependencies or state.

### Selected-task inspector

The inspector has the following sections or tabs:

1. **Overview**
   - Current phase, status, dependencies, attempt count, current action, and available controls.
2. **Approved task**
   - Immutable title, objective, success criteria, scope, context notes, verification guidance, routing tiers, maximum attempts, and approved revision.
3. **Prompts and attempts**
   - Attempt selector.
   - Exact implementation prompt captured at launch.
   - Exact verification prompt captured at launch.
   - Provider, model, tier, permission mode, command preview, and timestamps.
   - Copy action with explicit confirmation feedback.
4. **Files and evidence**
   - Worker-reported files.
   - Git-observed files and attribution quality.
   - Diff summary, checks, failed criteria, verdict, feedback, risks, and raw output.
   - Clickable repository-relative paths.
5. **Activity**
   - Task- and attempt-filtered audit events.

Prompt text is always the persisted prompt snapshot tied to the worker. The UI must never regenerate a historical prompt from current templates or task state.

## Current implementation findings

The current Managed Runs surface is concentrated in `src/renderer/managedRunsView.js`, `src/renderer/index.html`, and `src/renderer/styles.css`. It renders an editable plan followed by flat task, worker, output, and event cards.

The execution model already provides stable task IDs, dependencies, statuses, attempt records, independent verification, worker metadata, output, Git snapshots, and run events. The redesign should preserve the scheduler and lifecycle controls while changing how state is projected and inspected.

The implementation must address four data constraints before relying on the new UI:

1. `run.plan.tasks` and `run.tasks` currently share task object references. Runtime status and attempt mutations can therefore alter the apparent approved task record.
2. Exact worker prompts are captured and encrypted at rest, but `summarizeRun()` deliberately removes them from broad renderer payloads.
3. Current Git changed-file snapshots are cumulative working-tree observations, not defensible per-attempt attribution.
4. Existing editor file opening is scoped to a normal session ID, while a Managed Run may have only a repository root.

## Data and service architecture

### Immutable approved-plan snapshot

Introduce a definition-only approved plan snapshot containing the approved revision, approval timestamp, objective, constraints, mission success criteria, final verification guidance, and immutable task contracts.

Runtime task state remains separate. Editing or regenerating the plan invalidates approval. Starting execution requires a snapshot matching the approved revision.

Persisted schema migration must not claim perfect historical fidelity where it cannot be recovered. Older approved runs may receive a definition-only best-effort snapshot with explicit migration provenance.

### Explicit renderer contracts

Replace accidental whole-object projection with explicit serializers:

- Run-list/inbox summary.
- Run detail without protected prompts.
- Worker detail fetched on demand.

The worker-detail operation validates that the worker belongs to the requested run and returns its exact prompt, prompt metadata, output, and normalized evidence. Prompts remain absent from list payloads and `managed-run:changed` broadcasts.

If secure storage was unavailable and a prompt could not be restored, return an explicit availability reason rather than an empty string.

### Attempt and prompt metadata

Every worker should record:

- Attempt number where applicable.
- Prompt kind: planning, implementation, task verification, or integration verification.
- Prompt template version.
- Prompt creation timestamp.
- Approved definition revision used to construct it.

Each attempt continues to link its implementation and verification worker IDs.

### Normalized evidence and file attribution

Parse the implementer's required terminal JSON once and retain normalized summary, reported changed files, checks, risks, and parse status while preserving raw output.

Capture before/after Git name-status evidence where practical and label its attribution accurately. Keep worker-reported and Git-observed files separate. Normalize to repository-relative paths and treat all worker-provided paths as untrusted.

### Structured audit context

Extend event detail with optional task ID, attempt number, worker ID, phase, verdict, and human-override information. Preserve readable event messages for compatibility.

### Managed Run file opening

Add a run-scoped file-open operation that resolves a relative path under the run repository, rejects traversal and repository escape, and reuses existing file size, type, and editor protections. It returns the editor-file shape already used by Monaco.

The integration must explicitly decide whether Managed Run links open editable or read-only. The initial recommendation is editable for consistency with the existing workspace editor, with no automatic write and no hidden terminal session.

### Pure workflow projections

Centralize deterministic selectors for:

- Overall verified progress.
- Current action.
- Task phase and station state.
- Dependency availability.
- Attempt and retry-loop representation.
- Final verification state.
- Inbox items, priority, and deep-link target.

Inbox, journey, and inspector must consume the same projections so they cannot disagree about current state.

## Renderer architecture

Refactor the current single Managed Runs renderer into focused modules:

- `managedRunSelectors.js`: progress, status, attention, journey, and attempt projections.
- `managedRunJourney.js`: station and connector rendering.
- `managedRunInspector.js`: task, prompt, attempt, evidence, and file inspection.
- `managedRunInbox.js`: Managed Runs attention list.
- `managedRunsView.js`: controller state, subscriptions, commands, and composition.

Renderer state should track active run, selected task, selected attempt/worker, inspector section, loaded worker-detail cache, and live output. Selection, focus, expansion, and scroll must survive run-change events. Streaming output updates only the relevant output element.

## Accessibility and responsive requirements

- Stations are real interactive controls with meaningful accessible names.
- Status is represented by text and icon/shape as well as color.
- The journey has a linear semantic reading order.
- Focus moves predictably from inbox to station to inspector and returns to the originating station.
- Background run updates do not steal focus.
- Streaming output is not announced continuously.
- Prompt and output panes support keyboard scrolling, wrapping, selection, and copying.
- Reduced-motion preferences disable pulsing and nonessential transitions.
- Desktop uses journey plus right inspector.
- Narrow windows use a vertical journey and a full-width inspector below the selected task.
- Long plans, prompts, paths, and output cannot force page-level horizontal overflow.
- Dark and light themes receive equivalent state contrast.

## Delivery sequence

1. Separate immutable approved definitions from runtime task state and migrate persistence.
2. Add explicit view contracts and shared workflow/inbox projections.
3. Add secure, lazy exact-prompt inspection.
4. Normalize attempt evidence and structured audit context.
5. Add safe Managed Run file opening and editor integration.
6. Build the workflow journey.
7. Build the selected-task inspector.
8. Add the Managed Runs inbox and integrate the responsive shell.
9. Complete lifecycle, visual, accessibility, performance, and regression validation; then remove obsolete dashboard markup.

The old cards may coexist temporarily while backend contracts and new components are proven. Do not maintain two long-term Managed Runs interfaces.

## Validation strategy

### Service and persistence

- Approved task definitions remain unchanged as runtime tasks execute.
- Older persistence records migrate safely.
- Exact prompts survive restart when secure storage is available.
- Unavailable prompts have an explicit reason.
- Broad summaries and change events never include exact prompts.
- Retry attempts retain distinct prompt snapshots.
- Evidence parsing preserves malformed raw output and records parse failure.
- Run-scoped file opening rejects absolute paths, traversal, directories, binary/oversized files, and repository escape.

### Pure renderer behavior

- Every run and task state maps to an intentional station state.
- Linear, branched, blocked, retry, review, replan, final-verification, completed, and cancelled fixtures project correctly.
- Inbox categorization and priority are deterministic.
- Retry loops and prompt/worker relationships resolve correctly.
- Historical missing-data fallbacks are explicit.

### Renderer integration

- Station and attempt selection persist across live updates.
- Prompt detail is fetched only when requested and displays the correct immutable attempt prompt.
- File links invoke the correct run-scoped file operation.
- Live worker output does not rerender the journey or reset focus/scroll.
- Existing plan, routing, retry, override, pause, cancel, takeover, acceptance, and archive actions remain functional.
- Inbox deep links select the correct run, task, attempt, and inspector section.

### End-to-end fixtures

- Draft and plan approval.
- One-shot task pass.
- Verification failure followed by successful retry.
- Plan defect and reapproval.
- Environment-blocked attempt.
- Attempts exhausted and human review.
- Branched dependencies.
- Final integration verification and acceptance.
- Restart recovery with an interrupted worker.
- Prompt inspection for initial and retry attempts.
- Opening an affected file.
- Normal sessions unchanged.

Run focused Jest suites, the full test suite, `npm.cmd run check`, available Playwright coverage, and a manual Electron smoke test in dark/light themes and desktop/narrow window sizes.

## Principal risks

- **False historical record:** solved by immutable approved snapshots and persisted prompt snapshots, never reconstruction.
- **Sensitive prompt disclosure:** solved by encryption at rest, lazy detail access, no broad broadcasts, and no prompt text in logs/errors.
- **Misleading file causality:** solved by preserving reported versus observed provenance and improving before/after attribution.
- **Contradictory status displays:** solved by shared pure projections.
- **Render churn:** solved by preserving controller state and updating streaming output independently.
- **Graph ambiguity:** solved by deterministic dependency layout and semantic dependency labels rather than freeform positioning.
- **Accessibility regressions:** solved by DOM-first semantics and treating connectors as enhancement.
- **Scope regression:** existing planning, approval, routing, human control, and final acceptance remain available throughout migration.

## Task files

Implementation is decomposed into agent-ready task contracts under `docs/specs/managed-runs/ui-redesign-tasks/`.
