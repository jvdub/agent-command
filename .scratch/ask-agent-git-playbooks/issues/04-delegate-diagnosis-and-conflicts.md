# 04 — Delegate Git diagnosis and conflict resolution

**What to build:** Add Diagnose Git Problem and Resolve Conflicts playbooks to the established Ask Agent workflow. Diagnosis must gather evidence before attempting repair, automate only safe and reversible remedies, and ask before consequential repository changes. Conflict resolution must identify the operation in progress, resolve only mechanically clear conflicts without blindly choosing one side, validate the result, continue safe operations, and defer semantic intent to the user.

**Blocked by:** 01 — Delegate a Review Changes playbook through Ask Agent

**Status:** ready-for-agent

- [ ] Diagnose Git Problem and Resolve Conflicts appear as distinct choices in the Ask Agent menu.
- [ ] Both prompts include the session working directory and require fresh repository inspection rather than trusting UI snapshots.
- [ ] Diagnose Git Problem examines command output, repository state, configuration, remotes, locks, hooks, authentication, and signing evidence as relevant before proposing a cause.
- [ ] Only safe, reversible repairs with clear intent may happen automatically.
- [ ] Deleting locks, changing configuration or remotes, altering credentials, rewriting history, resetting state, or changing worktrees requires explicit user approval.
- [ ] Resolve Conflicts identifies whether a merge, rebase, cherry-pick, revert, or other Git operation is in progress before editing files.
- [ ] Mechanically clear conflicts may be resolved automatically; competing semantic changes are explained file by file and require user direction.
- [ ] The conflict prompt forbids blindly choosing ours or theirs and forbids aborting the operation without explicit instruction.
- [ ] Resolutions are validated with relevant checks, staged when complete, and the existing operation continues only when intent is clear and validation passes.
- [ ] Both playbooks report the diagnosed cause or resolution decisions, actions taken, checks, final repository state, and remaining risk.
- [ ] End-to-end catalog coverage verifies both playbooks' user-visible availability and decision-rich prompt content through the existing composer seam.
