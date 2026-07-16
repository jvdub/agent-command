# 02 — Delegate commit and publish workflows

**What to build:** Add Commit Changes and Commit and Push playbooks to the established Ask Agent workflow. Each prompt must direct the agent to inspect the live repository, establish a coherent scope, preserve unrelated work, follow repository conventions, validate proportionately, repair obvious deterministic problems, escalate decisions that require judgment, and report verified final state. Commit and Push must not publish known-bad work without explicit approval.

**Blocked by:** 01 — Delegate a Review Changes playbook through Ask Agent

**Status:** ready-for-agent

- [ ] Commit Changes and Commit and Push appear as distinct choices in the Ask Agent menu.
- [ ] Both prompts include the session working directory but do not embed potentially stale branch, status, or file-list snapshots.
- [ ] Both prompts require inspection of staged, unstaged, and untracked changes before choosing scope or staging files.
- [ ] A clearly coherent worktree may proceed without routine confirmation, while unrelated changes or multiple coherent commit units require user direction.
- [ ] Commit messages are derived from the actual changes and discoverable repository conventions.
- [ ] The prompts require proportionate documented checks before committing.
- [ ] Deterministic low-risk issues such as formatting, lint autofixes, generated-file synchronization, and clearly mechanical test failures may be fixed automatically and revalidated.
- [ ] Semantic, architectural, unclear, or scope-expanding fixes require an evidence-backed question to the user.
- [ ] Commit and Push requires successful validation or explicit approval before publication and verifies local branch, commit, upstream, and remote state afterward.
- [ ] Automatic fixes and all checks are included in the agent's final report.
- [ ] End-to-end catalog coverage verifies both playbooks' user-visible availability and decision-rich prompt content through the existing composer seam.
