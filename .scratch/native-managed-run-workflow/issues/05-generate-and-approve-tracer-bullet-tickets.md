# 05 — Generate and approve tracer-bullet Tickets

**What to build:** A fresh worker turns the approved Spec into an editable dependency graph of independently verifiable tracer-bullet Tickets, and Agentic Command creates a validated execution snapshot only after the user approves their boundaries and blocking edges.

**Blocked by:** 04 — Generate and approve a revisioned Spec.

**Status:** ready-for-agent

- [ ] Ticket generation uses a fresh read-only worker with the approved Spec, confirmed test seams, applicable domain decisions, and repository context.
- [ ] Each ordinary Ticket is a narrow end-to-end behavior that fits one fresh implementation context and can be demonstrated or verified independently.
- [ ] Layer-only Tickets are rejected unless they identify a legitimate prerequisite refactor, broad mechanical migration, or indivisible infrastructure exception.
- [ ] Wide changes use a validated expand–migrate–contract dependency shape that keeps the repository green where practical.
- [ ] Every Ticket records behavior, acceptance criteria, blockers, test seams, TDD policy or exception, verification guidance, relevant context, capability tiers, and retry limits.
- [ ] The user can edit Ticket Markdown, merge or split proposed slices, change blockers, and compare revisions before approval.
- [ ] Agentic Command validates identifiers, required fields, dependency references, and cycles before allowing approval.
- [ ] Approval freezes a structured execution projection derived from the exact approved Markdown revision.
- [ ] The workflow canvas expands the Tickets station into the approved dependency graph and clearly shows the executable frontier.
- [ ] The deterministic Electron seam demonstrates draft revision, graph correction, approval, projection validation, and visible dependency layout.
