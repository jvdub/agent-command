# 04 — Generate and approve a revisioned Spec

**What to build:** A fresh worker synthesizes approved Shape context into an editable Spec with confirmed behavioral test seams. The user can compare revisions and approve the exact contract that will drive ticket creation.

**Blocked by:** 02 — Shape an idea through an interactive approval gate; 03 — Maintain and commit domain decisions during Shape.

**Status:** implemented

- [x] Spec generation uses a fresh read-only worker with the approved Shape transcript, shaping artifact, domain documentation, architectural decisions, and repository context.
- [x] The generated Markdown covers the problem, solution, extensive user stories, implementation decisions, testing decisions, exclusions, and further notes.
- [x] The Spec proposes the highest practical observable test seams, prefers existing seams, and requires explicit confirmation for new seams.
- [x] The user can edit Spec Markdown in the application or Run Workspace and compare it with the previous approved revision.
- [x] Spec approval records the exact revision, timestamp, user action, and upstream Shape revision.
- [x] Editing Shape or Spec invalidates Spec approval and marks all future downstream artifacts stale.
- [x] Tickets remains blocked until the current Spec revision is approved.
- [x] The retained workflow canvas makes Spec generation, editing, stale state, approval, and progression visually clear.
- [x] The deterministic Electron seam demonstrates synthesis, a test-seam confirmation, manual editing, approval, and invalidation.
