# 03 — Delegate repository synchronization and branch creation

**What to build:** Add Pull Safely and Create Branch playbooks to the established Ask Agent workflow. Pull Safely must instruct the agent to fetch and inspect live repository state before synchronizing, complete unambiguous fast-forwards, honor explicit repository policy, and ask before acting through dirty or ambiguously diverged state. Create Branch must derive an appropriate name from task context and repository conventions, preserve local work, and avoid hidden stash, discard, or commit operations.

**Blocked by:** 01 — Delegate a Review Changes playbook through Ask Agent

**Status:** ready-for-agent

- [ ] Pull Safely and Create Branch appear as distinct choices in the Ask Agent menu.
- [ ] Both prompts include the session working directory but require the agent to inspect live state independently.
- [ ] Pull Safely fetches and inspects worktree, branch, upstream, and ahead/behind state before choosing an action.
- [ ] A clean fast-forward may complete automatically and must be verified afterward.
- [ ] A dirty worktree causes the agent to explain the state and ask whether to commit, stash, or cancel rather than choosing silently.
- [ ] Explicit repository pull policy is honored; divergent history without an explicit policy requires a merge-or-rebase decision from the user.
- [ ] Create Branch infers a concise name from the current task and repository naming conventions when the intent is clear.
- [ ] Ambiguous task intent or naming conventions cause the agent to propose a name and ask the user.
- [ ] Branch creation starts from current HEAD and carries working-tree changes only when Git can do so safely.
- [ ] Create Branch never auto-stashes, discards, or commits merely to complete the operation.
- [ ] Both playbooks require a concise final report of actions and verified repository state.
- [ ] End-to-end catalog coverage verifies both playbooks' user-visible availability and decision-rich prompt content through the existing composer seam.
