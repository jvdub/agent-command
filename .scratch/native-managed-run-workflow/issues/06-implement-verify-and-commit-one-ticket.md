# 06 — Implement, verify, and commit one Ticket

**What to build:** Agentic Command executes one approved frontier Ticket in the Run Worktree, independently verifies the complete change set against Spec and Standards, and automatically creates one local commit whose contents exactly match the reviewed diff.

**Blocked by:** 05 — Generate and approve tracer-bullet Tickets.

**Status:** implemented

- [x] A Ticket begins only when the run worktree is clean at the previous verified commit and all blockers have succeeded.
- [x] A fresh implementation worker receives the approved Spec summary, Ticket contract, confirmed seams, relevant domain decisions, repository state, and safety boundaries.
- [x] The worker reports observed red and green evidence when TDD is required, or the approved alternative verification evidence when an exception applies.
- [x] The implementation worker cannot commit, push, publish, rewrite history, or manage other workers.
- [x] One fresh read-only verifier inspects the entire change set and returns separate Spec and Standards assessments plus one structured verdict.
- [x] A passing verdict is bound to a fingerprint of the reviewed diff; any later change invalidates verification and triggers reverification.
- [x] Agentic Command commits the complete unchanged verified change set and records its SHA with the Ticket evidence.
- [x] Commit-message and branch conventions follow explicit repository guidance, then a clearly established recent convention, then Agentic Command fallbacks.
- [x] Traceability metadata is added only when compatible with repository conventions and always remains available in Run Workspace evidence.
- [x] The workflow canvas shows implementation, two-axis verification, and the resulting Ticket commit as one Ticket lifecycle.
- [x] A deterministic test proves that the commit contains exactly the reviewed files and that no push occurs.
