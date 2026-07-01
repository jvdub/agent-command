# Task 07: Build the Expandable Task Inspector

## Objective

Provide a selected-task inspector that exposes the approved task definition, exact one-shot prompts, attempts, verification evidence, affected files, activity, and valid human controls.

## Context

The inspector is the detailed tile behavior paired with the workflow journey. Its most important responsibility is showing what the user approved versus what Agentic Command actually sent to each worker.

## Scope

- Add overview, approved-task, prompts/attempts, files/evidence, and activity sections.
- Show the immutable approved definition and revision separately from runtime state.
- Add attempt and worker-role selection.
- Lazy-load and cache exact worker detail only when requested.
- Label implementation, verification, and integration prompts unambiguously.
- Add prompt wrapping, selection, and copy controls.
- Show provider, model, tier, permission mode, command, timestamps, output, verdict, checks, failed criteria, feedback, and risks.
- Show reported versus observed file lists with provenance and safe open actions.
- Retain retry, human override, and other valid task controls with existing confirmations.
- Preserve inspector tab, attempt selection, focus, and scroll across run updates.
- Provide explicit loading, unavailable, malformed, and historical-data states.

## Likely files

- New `src/renderer/managedRunInspector.js`
- `src/renderer/managedRunsView.js`
- `src/renderer/index.html`
- `src/renderer/styles.css`
- Renderer unit and integration tests

## Non-goals

- Do not regenerate historical prompts.
- Do not collapse reported and observed files into an unlabeled union.
- Do not automatically copy sensitive prompt text.

## Acceptance criteria

- The approved task definition and exact prompt sent are visually and semantically distinct.
- Every implementation and verification attempt can expose its own immutable prompt.
- Retry prompts visibly contain the actual feedback sent at that time.
- Prompt detail is loaded only on demand.
- Every safe affected-file entry can open in the editor.
- Evidence and controls correspond to the selected attempt/task.
- Background updates do not reset the user's inspection context.

## Required tests

- Initial and retry prompt selection.
- Prompt redaction before lazy fetch.
- Loading, unavailable, and failed-fetch states.
- Prompt copy feedback and keyboard scrolling.
- Reported/observed file labels and file-open callback.
- All verification verdict types.
- Selection, focus, and scroll preservation during live updates.

## Dependencies

- Tasks 01 through 05.
- Task 06 for station selection integration.

