# 03 — Maintain and commit domain decisions during Shape

**What to build:** Shape can maintain recognized project glossary and architectural-decision documentation in the isolated Run Worktree, and Agentic Command commits only the approved documentation changes when the user passes the Shape gate.

**Blocked by:** 02 — Shape an idea through an interactive approval gate.

**Status:** ready-for-agent

- [ ] Shape detects an existing single- or multi-context domain-document convention and uses its canonical terminology.
- [ ] Shape write permission is constrained to recognized glossary and architectural-decision documentation rather than application code.
- [ ] When no convention exists, proposed domain material remains in the Run Workspace until the user approves creating project documentation.
- [ ] The Shape gate presents the exact tracked documentation diff alongside the shaping artifact.
- [ ] Approval binds to a diff fingerprint and is invalidated if the documentation changes before commit.
- [ ] Agentic Command, not the shaping worker, commits approved tracked documentation changes on the run branch.
- [ ] The commit follows documented repository conventions, a clearly established history convention, or a sensible fallback in that order.
- [ ] The workflow canvas and evidence view show the approved Shape commit without treating it as an implementation Ticket.
- [ ] Tests demonstrate that attempted writes outside recognized documentation are rejected and that the source checkout remains untouched.
