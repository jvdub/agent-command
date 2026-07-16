const REVIEW_CHANGES_PROMPT = ({ workingDirectory }) => `Objective: Review the current Git changes in ${workingDirectory} without modifying the repository.

Required inspection: Inspect live Git state first, including staged, unstaged, and untracked changes plus relevant recent context. Do not rely on a previously displayed file list.

Review rules: Explain the purpose of the changes rather than only listing files. Flag confirmed bugs, accidental files, secrets, generated artifacts, missing tests, and mixed commit scopes. Distinguish evidence from uncertainty. Do not modify files, stage changes, create commits, or perform any other repository mutation.

Completion: Give a concise report of findings, relevant validation gaps, and the recommended next action: revise, split, commit, or investigate.`;

export const GIT_PLAYBOOKS = Object.freeze([
  Object.freeze({
    id: "review-changes",
    label: "Review Changes",
    renderPrompt: REVIEW_CHANGES_PROMPT,
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
