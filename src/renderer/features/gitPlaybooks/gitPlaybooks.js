const REVIEW_CHANGES_PROMPT = ({ workingDirectory }) => `Objective: Review the current Git changes in ${workingDirectory} without modifying the repository.

Required inspection: Inspect live Git state first, including staged, unstaged, and untracked changes plus relevant recent context. Do not rely on a previously displayed file list.

Review rules: Explain the purpose of the changes rather than only listing files. Flag confirmed bugs, accidental files, secrets, generated artifacts, missing tests, and mixed commit scopes. Distinguish evidence from uncertainty. Do not modify files, stage changes, create commits, or perform any other repository mutation.

Completion: Give a concise report of findings, relevant validation gaps, and the recommended next action: revise, split, commit, or investigate.`;

const COMMIT_CHANGES_PROMPT = ({ workingDirectory }) => `Objective: Create an appropriate commit from the current work in ${workingDirectory}; do not push it.

Inspect first: Read repository guidance and inspect live staged, unstaged, and untracked changes plus relevant recent commits. Establish the actual intent and a coherent commit scope. If the worktree is one clearly coherent unit, proceed without routine confirmation. Preserve unrelated work. If it contains multiple coherent units or scope is ambiguous, explain the evidence and ask the user what to include.

Execution: Stage only the chosen scope. Derive the commit message from the changes and repository conventions. Run proportionate documented checks. Automatically repair and revalidate only obvious deterministic issues such as formatting, lint autofixes, generated-file synchronization, or clearly mechanical test failures. After any automatic repair, inspect the resulting diff, confirm it remains within scope, and stage the in-scope repair changes while preserving unrelated work. Ask before any Semantic, architectural, unclear, destructive, or scope-expanding fix. Do not amend an existing commit.

Completion: Verify the commit and remaining worktree state. Report scope, automatic fixes, checks and results, commit identifier and message, and anything left uncommitted.`;

const COMMIT_AND_PUSH_PROMPT = ({ workingDirectory }) => `Objective: Create an appropriate commit from the current work in ${workingDirectory} and publish it safely.

Inspect first: Read repository guidance and inspect live staged, unstaged, and untracked changes, current branch, upstream, remote state, and relevant recent commits. Establish a coherent scope. Proceed without routine confirmation only when the worktree is one clearly coherent unit; preserve unrelated work and ask when scope contains multiple units or is ambiguous.

Execution: Stage the chosen scope, derive the message from the changes and repository conventions, and run proportionate documented validation. Automatically repair and revalidate only obvious deterministic formatting, lint, generated-file, or mechanical test issues. After any automatic repair, inspect the resulting diff, confirm it remains within scope, and stage the in-scope repair changes while preserving unrelated work. Ask before semantic, architectural, unclear, destructive, or scope-expanding fixes. Do not amend. Never push known-bad work unless the user explicitly approves the specific validation failure. Ask before force-push, history rewrite, or an unclear target/upstream.

Completion: Push only after validation or explicit approval. Verify local branch, commit, upstream, and remote state. Report scope, fixes, checks, commit, push result, and remaining worktree state.`;

const PULL_SAFELY_PROMPT = ({ workingDirectory }) => `Objective: Synchronize ${workingDirectory} with its upstream safely while preserving local work.

Inspect first: Fetch without changing the worktree, then inspect live worktree status, current branch, upstream, ahead/behind state, repository pull policy, and relevant remote refs. Do not trust a displayed UI snapshot.

Decision rules: If the worktree is clean and the branch can fast-forward, complete the fast-forward and verify it. Honor an explicit repository merge or rebase policy. If the worktree is dirty, explain what is present and ask whether to commit, stash, or cancel; do not choose silently. If history has diverged and no policy resolves it, explain the consequences and ask the user to choose merge or rebase. Ask before conflict resolution, force operations, destructive cleanup, or changing configuration, remotes, credentials, or history.

Completion: Report fetch and synchronization actions, the policy used, and verified final worktree, branch, upstream, and ahead/behind state. If blocked, report the evidence and exact decision needed.`;

const CREATE_BRANCH_PROMPT = ({ workingDirectory }) => `Objective: Create and switch to an appropriate branch for the current task in ${workingDirectory} without disturbing local work.

Inspect first: Inspect live worktree, current branch and current HEAD, recent context, and repository branch naming conventions. Infer a concise task-derived name when intent and convention are clear. If either is ambiguous, propose a name with your reasoning and ask the user before creating it.

Execution rules: Create the branch from current HEAD and carry existing working-tree changes only when Git can do so safely. Preserve every local change. To complete this request, never stash, discard, or commit changes, never reset or rewrite history, and never delete or overwrite an existing branch. Ask the user if the proposed name already exists, the starting point is uncertain, or Git reports a safety conflict.

Completion: Verify and report the created branch, starting commit, current branch, and preserved worktree state. If no branch was created, report the evidence and decision required.`;

const DIAGNOSE_GIT_PROBLEM_PROMPT = ({ workingDirectory }) => `Objective: Diagnose the reported Git problem in ${workingDirectory} and repair it only when the remedy is safe, reversible, and unambiguous.

Evidence first: Reproduce or inspect the relevant command output and live repository state. Examine configuration, remotes, refs, locks, worktrees, hooks, authentication, signing, filesystem state, and recent operations only as relevant. Separate confirmed evidence from hypotheses and identify the most likely cause before changing anything.

Repair rules: Automatically apply only a narrowly scoped, reversible remedy whose intent is clear, then rerun the failing operation or a safe verification. Ask for explicit approval before deleting locks, changing configuration or remotes, altering credentials or signing, resetting state, changing worktrees, rewriting history, discarding work, or making any consequential or ambiguous change. Never expose secrets in the report.

Completion: Report the diagnosed cause, supporting evidence, actions taken, checks and results, verified final repository state, and remaining risk. If approval or user action is needed, ask one evidence-backed question with the available options and consequences.`;

const RESOLVE_CONFLICTS_PROMPT = ({ workingDirectory }) => `Objective: Resolve the active Git conflicts in ${workingDirectory} without guessing product intent or losing work.

Inspect first: Determine whether a merge, rebase, cherry-pick, revert, or another Git operation is active. Inspect live status, conflict stages, operation metadata, surrounding changes, and repository guidance before editing.

Resolution rules: Resolve mechanically clear conflicts when both intended changes can be preserved confidently. Never blindly choose ours or theirs. For competing semantic changes, explain the conflict file by file, identify the decisions, and ask the user. Do not abort the operation, discard changes, reset state, or rewrite history without explicit instruction. After resolving a file, remove conflict markers, run relevant checks, and stage it only when complete. Continue the active operation only when intent is clear, every conflict is resolved, and validation passes; otherwise stop and ask.

Completion: Report the operation, resolution decisions, files changed and staged, checks, continuation result, verified Git state, and remaining risks or decisions.`;

export const GIT_PLAYBOOKS = Object.freeze([
  Object.freeze({
    id: "review-changes",
    label: "Review Changes",
    renderPrompt: REVIEW_CHANGES_PROMPT,
  }),
  Object.freeze({
    id: "commit-changes",
    label: "Commit Changes",
    renderPrompt: COMMIT_CHANGES_PROMPT,
  }),
  Object.freeze({
    id: "commit-and-push",
    label: "Commit and Push",
    renderPrompt: COMMIT_AND_PUSH_PROMPT,
  }),
  Object.freeze({
    id: "pull-safely",
    label: "Pull Safely",
    renderPrompt: PULL_SAFELY_PROMPT,
  }),
  Object.freeze({
    id: "create-branch",
    label: "Create Branch",
    renderPrompt: CREATE_BRANCH_PROMPT,
  }),
  Object.freeze({
    id: "diagnose-git-problem",
    label: "Diagnose Git Problem",
    renderPrompt: DIAGNOSE_GIT_PROBLEM_PROMPT,
  }),
  Object.freeze({
    id: "resolve-conflicts",
    label: "Resolve Conflicts",
    renderPrompt: RESOLVE_CONFLICTS_PROMPT,
  }),
]);

export function getGitPlaybook(playbookId) {
  return GIT_PLAYBOOKS.find((playbook) => playbook.id === playbookId) || null;
}

export function renderGitPlaybookPrompt(playbookId, context) {
  const playbook = getGitPlaybook(playbookId);
  if (!playbook) {
    throw new Error("Unknown Git playbook.");
  }

  return playbook.renderPrompt(context);
}
