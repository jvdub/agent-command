# 01 — Start a Managed Run in an isolated Shape workspace

**What to build:** The existing Create Managed Run action starts the replacement workflow from a reproducible committed base. Agentic Command creates an isolated run branch, worktree, and Run Workspace, then displays Shape as the active station on the retained workflow canvas without disturbing the source checkout.

**Blocked by:** None — can start immediately.

**Status:** implemented

- [x] Creating a run from a Git repository records the selected target branch and exact committed base revision.
- [x] The run receives one isolated branch and worktree that do not include or modify uncommitted changes in the source checkout.
- [x] When the source checkout is dirty, the user can continue from committed HEAD, cancel, or select another committed base after seeing that those changes are excluded.
- [x] Agentic Command creates the default locally ignored Run Workspace and allows its location and tracking policy to be overridden.
- [x] The persisted run uses the replacement phase and artifact-lineage model without requiring legacy-run migration.
- [x] The workflow canvas remains the primary run view and shows Shape, Spec, Tickets, Implement, and Accept with Shape active.
- [x] A deterministic Electron test creates a run against a temporary real Git repository and verifies the visible canvas, isolated Git state, Run Workspace, and untouched source checkout.
