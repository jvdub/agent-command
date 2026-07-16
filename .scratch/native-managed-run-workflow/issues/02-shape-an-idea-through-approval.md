# 02 — Shape an idea through an interactive approval gate

**What to build:** A user can develop a rough idea through a persistent, one-question-at-a-time shaping conversation, inspect and edit the evolving Markdown artifact, and explicitly confirm shared understanding before Spec becomes available.

**Blocked by:** 01 — Start a Managed Run in an isolated Shape workspace.

**Status:** ready-for-agent

- [ ] Shape uses a capable persistent interactive worker while other artifact boundaries use fresh workers.
- [ ] The worker researches facts available from the repository and asks the user only for genuine decisions, one at a time.
- [ ] The shaping conversation and its human-readable summary are revisioned in the Run Workspace.
- [ ] The user can edit the shaping artifact directly as Markdown in Agentic Command or through the workspace file.
- [ ] Shape approval records the exact artifact and conversation revisions accepted by the user.
- [ ] Spec remains blocked until Shape approval and returns to blocked when the approved shaping artifact changes.
- [ ] The workflow canvas shows the active Shape conversation, approval requirement, completed gate, and next available station.
- [ ] The deterministic Electron seam demonstrates conversation, editing, approval, revision invalidation, and visible canvas transitions.
