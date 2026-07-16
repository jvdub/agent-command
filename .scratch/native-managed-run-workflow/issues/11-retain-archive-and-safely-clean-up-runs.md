# 11 — Retain, archive, and safely clean up runs

**What to build:** Users can retain and inspect accepted workflow evidence, archive completed runs without destroying history, and separately clean up eligible local resources with explicit safety checks.

**Blocked by:** 10 — Accept and locally integrate a verified run.

**Status:** ready-for-agent

- [ ] Acceptance leaves the Run Workspace, run branch, worktree, artifacts, worker evidence, and commit associations intact.
- [ ] Archiving removes the run from active workflow attention without deleting artifacts or Git resources.
- [ ] The archived run remains inspectable with its workflow canvas, Approval Gates, artifact revisions, Ticket evidence, and integration result.
- [ ] Cleanup is a separate explicit action that previews every resource it proposes to remove.
- [ ] Automatic cleanup eligibility requires proof that the run branch is integrated; otherwise deletion requires a separate destructive confirmation.
- [ ] Cleanup never removes the source checkout, target branch, unintegrated commits, or paths outside the recorded run resources.
- [ ] Deleting Run Workspace artifacts retains minimal app metadata, approval history, and relevant commit SHAs.
- [ ] Users can override retention and artifact-tracking preferences for future runs without changing completed-run history.
- [ ] Tests cover archive-without-delete, safe integrated cleanup, refusal of unsafe cleanup, and minimal metadata retention.
