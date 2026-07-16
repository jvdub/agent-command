# 06 — Implement, verify, and commit one Ticket

**What to build:** Agentic Command executes one approved frontier Ticket in the Run Worktree, independently verifies the complete change set against Spec and Standards, and automatically creates one local commit whose contents exactly match the reviewed diff.

**Blocked by:** 05 — Generate and approve tracer-bullet Tickets.

**Status:** ready-for-agent

- [ ] A Ticket begins only when the run worktree is clean at the previous verified commit and all blockers have succeeded.
- [ ] A fresh implementation worker receives the approved Spec summary, Ticket contract, confirmed seams, relevant domain decisions, repository state, and safety boundaries.
- [ ] The worker reports observed red and green evidence when TDD is required, or the approved alternative verification evidence when an exception applies.
- [ ] The implementation worker cannot commit, push, publish, rewrite history, or manage other workers.
- [ ] One fresh read-only verifier inspects the entire change set and returns separate Spec and Standards assessments plus one structured verdict.
- [ ] A passing verdict is bound to a fingerprint of the reviewed diff; any later change invalidates verification and triggers reverification.
- [ ] Agentic Command commits the complete unchanged verified change set and records its SHA with the Ticket evidence.
- [ ] Commit-message and branch conventions follow explicit repository guidance, then a clearly established recent convention, then Agentic Command fallbacks.
- [ ] Traceability metadata is added only when compatible with repository conventions and always remains available in Run Workspace evidence.
- [ ] The workflow canvas shows implementation, two-axis verification, and the resulting Ticket commit as one Ticket lifecycle.
- [ ] A deterministic test proves that the commit contains exactly the reviewed files and that no push occurs.
