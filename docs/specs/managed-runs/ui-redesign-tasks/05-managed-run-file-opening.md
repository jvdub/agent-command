# Task 05: Add Safe Managed Run File Opening

## Objective

Make affected files in a Managed Run clickable and open them in the existing Monaco editor without requiring or creating a normal terminal session.

## Context

The current workspace editor API resolves files through a session ID. Managed Runs have a repository root and may have no corresponding normal session. Worker-reported paths are untrusted.

## Scope

- Add a Managed-Run-scoped file-open service and IPC operation accepting a run ID and repository-relative path.
- Resolve the run and enforce containment under its repository root.
- Reuse existing regular-file, text/binary, size, and content protections.
- Handle symlink/reparse-point escape where supported by existing path validation.
- Return the same editor-file payload used by the current editor.
- Factor or reuse the renderer's existing editor activation path.
- Preserve selected run/task/attempt when the editor opens and closes.
- Explicitly implement the chosen editable/read-only behavior; default to existing editable editor behavior with no automatic write.

## Likely files

- `src/main/services/workspaceFileService.js`
- `src/main/ipc/registerManagedRunIpcHandlers.js`
- `src/shared/ipcContract.js`
- `src/preload.js`
- `src/renderer/agenticApp.js`
- `src/renderer/app.js`
- Workspace, IPC, preload, and renderer integration tests

## Non-goals

- Do not create a hidden session.
- Do not accept arbitrary absolute paths from the renderer.
- Do not add automatic saves or writes.

## Acceptance criteria

- A safe repository-relative file opens in the existing editor.
- Absolute paths, traversal, repository escape, directories, binary files, oversized files, and unknown runs are rejected.
- Opening a file does not lose Managed Run selection state.
- Normal session file opening remains unchanged.

## Required tests

- Service and IPC happy path.
- Traversal and containment cases, including sibling-prefix paths.
- Symlink/reparse escape where the platform test environment supports it.
- Binary, size, missing-file, and directory rejection.
- Renderer callback opens the expected file without creating a session.

## Dependencies

- Task 02 for the file detail contract.
- Task 04 for normalized file-path provenance.

