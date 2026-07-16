# 10 — Accept and locally integrate a verified run

**What to build:** A user can accept a mission with passing final evidence and integrate its verified commits into the selected local target branch without automatic publication, history rewriting, or conflict guessing.

**Blocked by:** 09 — Verify and repair the integrated mission.

**Status:** ready-for-agent

- [ ] Accept is a recorded human Approval Gate enabled only for the latest passing final integration result.
- [ ] The Accept view presents mission criteria, Ticket commits, repair commits, checks, risks, and the target integration preview.
- [ ] Acceptance fast-forwards the target branch when it has not moved and records the resulting local branch state.
- [ ] When the target has moved, Agentic Command shows the proposed normal merge and requires explicit confirmation before proceeding.
- [ ] Merge conflicts stop in a visible human-action state without automatic resolution, reset, rebase, or history rewriting.
- [ ] A successful integration marks the run accepted and records the target branch and resulting commit SHA.
- [ ] Acceptance never pushes, opens a pull request, or publishes artifacts.
- [ ] The workflow canvas shows final evidence, target integration status, conflicts, and accepted completion.
- [ ] Git integration tests cover fast-forward, moved-target merge, conflict detection, and absence of remote operations.
