# 09 — Verify and repair the integrated mission

**What to build:** After the approved Ticket frontier is empty, Agentic Command independently verifies the mission as a whole and automatically repairs bounded in-scope integration failures through the same verified-commit discipline.

**Blocked by:** 07 — Execute dependent Tickets with bounded recovery; 08 — Revise upstream artifacts without losing verified history.

**Status:** ready-for-agent

- [ ] Final integration begins only after every Ticket in the current approved snapshot has a passing verdict and verified commit.
- [ ] A fresh capable read-only verifier checks mission criteria, cross-Ticket behavior, the complete run branch, broader relevant tests, scope, and Standards.
- [ ] The final verdict includes checks, failed criteria, actionable feedback, risks, and separate Spec and Standards evidence.
- [ ] A fixable in-scope failure creates an internal integration-repair task without reopening Tickets approval.
- [ ] Integration repair starts from a clean boundary and uses a fresh implementer, two-axis verifier, unchanged-diff fingerprint, and Agentic Command commit.
- [ ] Each repair task defaults to three attempts and the run allows at most two complete integration-repair cycles unless the user changes limits while paused.
- [ ] Changed scope, plan defects, and human decisions return to the appropriate Approval Gate rather than being hidden inside repair.
- [ ] Accept remains blocked until final integration verification passes after the latest repair commit.
- [ ] The workflow canvas shows mission verification and repair inside the transition from Implement to Accept.
- [ ] The deterministic Electron seam demonstrates a final failure, repair commit, repeated integration verification, and eventual pass.
