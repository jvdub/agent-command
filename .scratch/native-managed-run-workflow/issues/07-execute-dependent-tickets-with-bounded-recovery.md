# 07 — Execute dependent Tickets with bounded recovery

**What to build:** A Managed Run works through its approved dependency frontier sequentially in one Run Worktree, carrying verified commits forward and recovering from fixable failures without hiding ambiguity or looping indefinitely.

**Blocked by:** 06 — Implement, verify, and commit one Ticket.

**Status:** implemented

- [x] After a Ticket commit, the scheduler selects the next frontier Ticket whose blockers have all succeeded.
- [x] Dependent Tickets begin from and can use every previous verified commit in the run worktree.
- [x] Independent frontier Tickets remain serial in the initial implementation.
- [x] A `fix_required` verdict sends concise actionable feedback to a fresh implementation attempt within the configured budget.
- [x] Ticket execution defaults to one initial attempt plus two retries, and only the user may change the budget before execution or while paused.
- [x] Unexpected external edits pause the run and invalidate any prior verdict rather than being guessed at or selectively staged.
- [x] Exhausted retries preserve the uncommitted diff and all evidence without creating a Ticket commit.
- [x] Human recovery offers manual takeover, return to an authoring phase, or separately confirmed restoration to the previous verified commit.
- [x] Environmental blockers and malformed outcomes stop in visible, stage-specific states with actionable diagnostics.
- [x] The workflow canvas shows dependencies, current frontier, attempts, verification feedback, commits, and attention states without becoming a flat card list.
- [x] The deterministic Electron seam demonstrates a dependency chain, one successful retry, one exhausted Ticket, and preservation of the failed change set.
