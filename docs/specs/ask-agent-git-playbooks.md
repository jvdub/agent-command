# Ask Agent Git Playbooks

## Problem Statement

Agentic Command shows files changed in an agent session, but users who want the agent to complete Git work must compose their own follow-up instructions. A full native Git client would duplicate capabilities already available to the agent and terminal, introduce repository-state, authentication, conflict, and destructive-operation complexity, and shift the product from agent supervision toward manual Git operation.

Users need a fast, reliable way to delegate common Git outcomes to the active agent with enough guidance that the agent inspects the live repository, preserves unrelated work, validates its actions, handles obvious problems, and asks for direction only when genuine judgment is required.

## Solution

Add an **Ask Agent** action to the Changed Files header. The action opens a compact menu of curated, app-owned Git playbooks:

1. Review Changes
2. Commit Changes
3. Commit and Push
4. Pull Safely
5. Create Branch
6. Diagnose Git Problem
7. Resolve Conflicts

Selecting a playbook opens an ephemeral composer containing an accurate, token-efficient, provider-neutral prompt. The user may review and edit it before deliberately sending it to the currently selected agent session. The prompt includes only the requested outcome and session working directory and requires the agent to inspect current Git state rather than trusting potentially stale UI state.

The feature delegates Git execution to the agent. Agentic Command does not stage, commit, pull, push, discard, switch branches, resolve conflicts, or manage credentials itself.

## User Stories

1. As an Agentic Command user, I want Git delegation actions beside Changed Files, so that I can act on the evidence I am already reviewing.
2. As a user, I want an Ask Agent menu rather than native Git controls, so that the agent remains responsible for repository operations.
3. As a user, I want to review a generated prompt before sending it, so that I understand and can refine the instruction.
4. As a user, I want the generated prompt to be editable, so that I can add task-specific context without writing the workflow from scratch.
5. As a user, I want closing the composer to discard its contents, so that stale Git instructions do not linger.
6. As a user, I want playbook drafts to remain ephemeral, so that old Git intentions are not restored unexpectedly.
7. As a user, I want the prompt sent only after an explicit Send to Agent action, so that choosing a menu item cannot type into a busy CLI.
8. As a user, I want a Copy action, so that I can place the prompt manually when preferred.
9. As a user, I want successful sending to close the composer and focus the agent terminal, so that I can immediately follow the delegated work.
10. As a user, I want a failed send to preserve my edited prompt and show an error, so that I can retry without reconstructing it.
11. As a user, I want double-send prevention, so that one deliberate action cannot dispatch the same Git task twice.
12. As a user, I want playbooks sent only to the currently selected agent session, so that another agent does not receive unintended instructions.
13. As a user, I want the feature disabled when no live agent session is available, so that I cannot send into a stopped, starting, or unavailable process.
14. As a user, I want manual terminals excluded as playbook targets, so that the feature consistently delegates to an agent.
15. As a user, I want a warning that readiness detection is not authoritative, so that I decide when the active CLI is ready to receive input.
16. As a user, I want each prompt to include the session working directory, so that the agent operates in the intended workspace.
17. As a user, I want prompts to require fresh repository inspection, so that the agent is not anchored to stale Changed Files state.
18. As a user, I want concise, structured prompts, so that they provide strong guidance without wasting context.
19. As a user, I want provider-neutral playbooks, so that the feature works consistently across supported agent CLIs.
20. As a user, I want Review Changes to remain read-only, so that asking for a review cannot mutate my repository.
21. As a user, I want Review Changes to inspect staged, unstaged, and untracked work, so that its summary covers the complete worktree.
22. As a user, I want Review Changes to summarize intent and flag bugs, secrets, generated artifacts, missing tests, and mixed scopes, so that I can decide what should happen next.
23. As a user, I want Commit Changes to verify scope before staging, so that unrelated work is preserved.
24. As a user, I want a coherent worktree committed without routine confirmation, so that delegation remains efficient.
25. As a user, I want the agent to ask when multiple unrelated commit units exist, so that it does not silently choose scope.
26. As a user, I want commit messages derived from the actual diff and repository conventions, so that commits describe the work accurately.
27. As a user, I want relevant documented checks run before committing, so that committed work has proportionate validation.
28. As a user, I want obvious deterministic validation problems fixed automatically, so that formatting or generated-file drift does not require another round trip.
29. As a user, I want the agent to ask before making semantic or scope-expanding fixes, so that product decisions remain mine.
30. As a user, I want automatic fixes included in the reviewed commit scope and final report, so that the resulting commit is transparent.
31. As a user, I want Commit and Push to verify final local and remote state, so that I know publication succeeded.
32. As a user, I want failed validation to prevent an unapproved push, so that known-bad work is not published silently.
33. As a user, I want Pull Safely to fetch and inspect branch, upstream, and worktree state first, so that it chooses a safe workflow from evidence.
34. As a user, I want clean fast-forward pulls completed automatically, so that routine synchronization is quick.
35. As a user, I want dirty-worktree pulls to pause for a commit, stash, or cancel decision, so that local work is not hidden or overwritten.
36. As a user, I want configured pull strategy honored, so that repository policy is respected.
37. As a user, I want an explicit merge-or-rebase choice when divergent history has no configured policy, so that the agent does not guess.
38. As a user, I want Create Branch to infer a concise name from the current task and repository conventions, so that branch creation requires little input.
39. As a user, I want ambiguous branch names proposed for confirmation, so that naming decisions remain intentional.
40. As a user, I want branch creation to preserve working-tree changes when safe, so that starting a branch does not disrupt active work.
41. As a user, I want branch creation never to auto-stash, discard, or commit, so that it does not silently alter my workflow.
42. As a user, I want Diagnose Git Problem to gather evidence before repairing anything, so that the reported cause is trustworthy.
43. As a user, I want safe and reversible Git repairs applied automatically, so that obvious problems can be resolved efficiently.
44. As a user, I want approval before locks, configuration, remotes, history, worktrees, or credentials are changed, so that consequential repairs remain controlled.
45. As a user, I want Resolve Conflicts to identify the operation in progress before editing, so that merge, rebase, cherry-pick, and revert states are handled correctly.
46. As a user, I want clear mechanical conflicts resolved automatically, so that delegation remains useful.
47. As a user, I want uncertain semantic conflicts explained file by file, so that I can decide intended behavior.
48. As a user, I want conflict resolution never to choose ours or theirs blindly, so that valid work is not discarded by shortcut.
49. As a user, I want relevant checks run after conflict resolution, so that the integrated result is validated.
50. As a user, I want resolved files staged and the current operation continued when intent is clear and checks pass, so that the agent completes mechanical resolution.
51. As a user, I want an in-progress Git operation aborted only by explicit request, so that resolution work is not discarded unexpectedly.
52. As a user, I want mutating playbooks to ask before destructive actions, force-pushes, history rewrites, ambiguous scope, or product decisions, so that autonomy has a clear safety boundary.
53. As a user, I want each playbook to report actions, checks, branch, commit, remote state, and remaining risks, so that I can verify the outcome.
54. As a keyboard or assistive-technology user, I want standard focus order, labels, and dismissal behavior, so that Git delegation is accessible.
55. As a user, I want the original Changed Files file-opening behavior preserved, so that adding playbooks does not weaken current oversight.
56. As a user, I want no native Git mutation to occur when using the menu or composer, so that repository changes come only from the delegated agent workflow.

## Implementation Decisions

- The feature is an oversight-and-delegation capability, not a native source-control client.
- No Git library dependency is added. In particular, the previously considered native Git abstraction is not part of this solution.
- The Changed Files header gains an Ask Agent control while retaining its current file status and file-opening responsibilities.
- Playbooks are canonical application-owned definitions, not installed provider-specific skills. This keeps behavior consistent across supported agent CLIs.
- The initial catalog contains exactly seven playbooks: Review Changes, Commit Changes, Commit and Push, Pull Safely, Create Branch, Diagnose Git Problem, and Resolve Conflicts.
- There is no Custom Git Request item; arbitrary requests already belong in the agent terminal, and generated prompts remain editable.
- Each playbook is rendered as a concise structured prompt containing an objective, required inspection, execution rules, escalation conditions, and completion criteria.
- Prompts target roughly 100–180 words where the workflow permits it. Accuracy and decision-rich guidance take precedence over an exact count.
- Generated prompts include the selected session working directory and requested outcome. They do not embed branch, status, or file-list snapshots.
- Every playbook requires the agent to inspect live repository state before acting.
- Selecting a playbook opens a lightweight ephemeral composer. Selection alone never writes to the PTY.
- The composer supports editing, copying, sending, and dismissal. Dismissal discards the draft, and drafts are not persisted.
- Sending writes the complete prompt as one bracketed-paste-safe input followed by submission to the active agent PTY.
- The composer closes and terminal focus returns after a successful send.
- A failed send keeps the edited prompt available and displays an actionable error.
- Dispatch prevents accidental duplicate sends.
- Ask Agent is available only for the currently selected live agent session associated with the Changed Files workspace. It never targets a manual terminal.
- Session-readiness heuristics may inform warning copy or disabled states but are not represented as proof that the underlying CLI is waiting for input.
- The user is responsible for the final Send action after considering whether the agent is ready.
- Mutating playbooks tell the agent to proceed without routine confirmation after inspection, while requiring user input for ambiguous scope, unrelated changes, destructive operations, unconfigured divergent-history strategy, force-push or history rewrite, and product-level conflict decisions.
- Commit playbooks treat the full worktree as intended only when it is one clearly coherent unit. They preserve unrelated work and ask before splitting or choosing among multiple coherent units.
- Commit playbooks discover repository conventions and run proportionate documented checks.
- Deterministic low-risk issues within scope may be repaired automatically, including formatting, lint autofixes, generated-file synchronization, and clearly mechanical test breakage. Semantic, architectural, unclear, or scope-expanding fixes require user direction.
- Pull Safely fetches and inspects first, fast-forwards a clean branch when possible, honors explicit repository strategy, and asks before acting through dirty or ambiguously diverged state.
- Create Branch derives naming from conversation context and repository convention, asks when ambiguous, starts from current HEAD, and never auto-stashes, discards, or commits.
- Diagnose Git Problem diagnoses before repair and asks before consequential changes to locks, configuration, remotes, history, worktrees, or credentials.
- Resolve Conflicts identifies the active Git operation, resolves only clear conflicts autonomously, validates the result, continues when safe, and never aborts without explicit direction.
- Review Changes is strictly read-only and distinguishes confirmed findings from uncertainty.
- Playbook prompts and agent responses remain part of normal terminal history. No parallel execution log or playbook state machine is introduced.
- Existing application security boundaries remain intact: the renderer uses the narrowed session-write bridge and receives no Node, filesystem, or generic command-execution capability.
- Existing Changed Files refresh throttling and file-opening behavior remain unchanged except where necessary to host and enable the new control.
- Architecture exception for this increment: the documented renderer `stateManager.features` and dispatcher infrastructure does not yet exist in the checkout. The isolated Git playbook controller therefore owns its ephemeral composer state and receives lifecycle notifications through a narrow composition API in the renderer entry point; introducing the missing application-wide state and command infrastructure is outside this feature's scope.

## Testing Decisions

- Tests assert external behavior rather than internal function names, markup structure, or exact implementation layout.
- The preferred and primary test boundary is one renderer-level Electron end-to-end seam adjacent to the existing Changed Files drawer coverage.
- The end-to-end seam starts a real application session and verifies that Ask Agent appears only for an eligible active agent session.
- The test verifies that all seven named playbooks are discoverable.
- The test opens each playbook and verifies its generated prompt communicates the correct objective, required live-state inspection, safety boundary, and session working directory without embedding stale status data.
- The test verifies prompt editing, copying, dismissal, and ephemeral behavior.
- The test verifies a successful Send dispatches exactly one complete prompt to the active agent PTY, closes the composer, and restores terminal focus.
- The test verifies stopped or unavailable sessions cannot send and manual terminals are never targets.
- The test verifies a simulated send failure preserves edited content and presents an error.
- The test verifies choosing a playbook without sending causes no PTY input and no repository mutation.
- The existing modified-file fixture pattern is prior art: the test creates and removes its own controlled workspace evidence instead of depending on the developer worktree.
- Prompt definitions should be deterministic and renderer-safe. Additional lower-level tests are warranted only if a failure mode cannot be exercised reliably through the high-level seam.
- Existing syntax, unit, and Electron end-to-end checks remain required for implementation acceptance.

## Out of Scope

- Native staging, unstaging, committing, pulling, pushing, discarding, branching, stashing, rebasing, or conflict resolution performed by Agentic Command.
- Adding a Git execution library.
- A VS Code-style Source Control panel with Staged Changes, Merge Changes, ahead/behind controls, or native branch controls.
- Diff rendering, side-by-side diffs, line decorations, and hunk-level operations.
- Commit-message fields or commit-draft persistence.
- Native credential, SSH key, signing key, remote, or Git configuration management.
- Force-push controls, history rewriting, amend, cherry-pick, and advanced branch administration.
- Persistent user customization of playbook templates.
- Provider-installed skill discovery or reliance on a provider-specific skill format.
- A generic Custom Git Request playbook.
- Automatic agent-readiness detection guarantees.
- Separate playbook execution tracking, audit logs, notifications, or status state machines.
- Sending playbooks to manual terminals.
- Changing the current behavior of opening the filesystem version of a changed file.

## Further Notes

- The product principle is to keep the agent responsible for Git execution while giving the user a high-quality, visible delegation shortcut.
- The Changed Files area remains an oversight surface: users inspect what changed and can quickly ask the responsible agent to review, integrate, publish, synchronize, branch, diagnose, or resolve.
- Prompt wording is product behavior. Implementers should review it for correctness, safety, clarity, and token efficiency with the same care as other user-facing workflow logic.
- The current architecture already provides a narrowed renderer-to-session write path. The feature should compose with that boundary rather than introduce Git IPC or generic command execution.
- The ready-for-agent implementation should preserve unrelated worktree changes and avoid coupling tests to the repository's ambient Git state.
