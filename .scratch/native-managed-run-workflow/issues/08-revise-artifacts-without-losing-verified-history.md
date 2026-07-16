# 08 — Revise upstream artifacts without losing verified history

**What to build:** When execution reveals a decision or plan defect, the user can return to Shape, Spec, or Tickets, approve corrected artifacts, and resume without erasing verified commits or silently trusting stale evidence.

**Blocked by:** 06 — Implement, verify, and commit one Ticket.

**Status:** ready-for-agent

- [ ] Structured worker outcomes distinguish fixable implementation failures from human decisions, Spec defects, and Ticket decomposition defects.
- [ ] A defect routes the run to the earliest authoring phase that must change and pauses autonomous execution.
- [ ] Revising an upstream artifact creates a new revision and marks every affected downstream artifact, execution projection, and pending Ticket stale.
- [ ] Verified Ticket commits remain on the run branch and retain their original evidence.
- [ ] The new Tickets approval gate identifies completed commits that appear applicable, questionable, or incompatible with the revised plan.
- [ ] The user explicitly retains applicable completed work or creates reversal work; Agentic Command never silently resets verified history.
- [ ] Resumed execution uses a new immutable snapshot linked to the new approvals while preserving the complete audit chain.
- [ ] The workflow canvas visually routes backward to the affected phase and distinguishes preserved completed work from stale or replacement Tickets.
- [ ] Tests demonstrate Shape-, Spec-, and Tickets-level revisions after at least one verified commit.
