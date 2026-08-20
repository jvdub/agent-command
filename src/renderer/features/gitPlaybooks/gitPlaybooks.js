const REVIEW_CHANGES_PROMPT = ({ workingDirectory }) =>
  `Review the current changes in ${workingDirectory}. Keep this read-only.`;

const COMMIT_CHANGES_PROMPT = ({ workingDirectory }) =>
  `Commit the current changes in ${workingDirectory}.`;

const COMMIT_AND_PUSH_PROMPT = ({ workingDirectory }) =>
  `Commit and push the current changes in ${workingDirectory}.`;

const PULL_SAFELY_PROMPT = ({ workingDirectory }) =>
  `Pull the latest changes safely in ${workingDirectory}.`;

const CREATE_BRANCH_PROMPT = ({ workingDirectory }) =>
  `Create an appropriate branch for the current task in ${workingDirectory}.`;

const DIAGNOSE_GIT_PROBLEM_PROMPT = ({ workingDirectory }) =>
  `Diagnose the Git problem in ${workingDirectory} and fix it if safe.`;

const RESOLVE_CONFLICTS_PROMPT = ({ workingDirectory }) =>
  `Resolve the current Git conflicts in ${workingDirectory}. Ask if the intended resolution is unclear.`;

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
