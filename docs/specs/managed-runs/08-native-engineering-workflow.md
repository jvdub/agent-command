# Native Managed Run Engineering Workflow

Status: Ready for agent

## Problem Statement

Managed Runs currently begin with a written specification and collapse repository inspection, planning, and task decomposition into one planner-generated plan. This makes the execution loop rigorous, but leaves the most consequential product and engineering decisions under-shaped. The user does not get a durable progression from rough idea to shared understanding, approved specification, and approved implementation slices.

The current plan also serves too many purposes at once. It is simultaneously a human editing surface, mission specification, task list, and scheduler input. That obscures artifact lineage and makes it difficult to determine which decisions were approved, which downstream work became stale after an edit, and what exactly an implementation worker is authorized to do.

Managed Runs should own the entire engineering workflow. A user should be able to begin with a rough idea, collaboratively sharpen it, approve a recognizable specification, approve independently verifiable tickets, let Agentic Command implement and verify those tickets autonomously, and finally accept locally integrated work. The workflow must preserve the existing strengths of deterministic scheduling, independent verification, bounded retries, evidence, and human control while adding automatic local commits for verified tickets.

## Solution

Replace the current planning-centric Managed Run with five native phases:

`Shape -> Spec -> Tickets -> Implement -> Accept`

Agentic Command implements these phase semantics natively. It does not depend on installed slash-command skills or external issue trackers.

Each phase produces or consumes revisioned, human-readable Markdown artifacts in a repository-local Run Workspace. The default workspace is `.agentic/runs/<run-id>/`, excluded through the repository's local Git exclusion configuration rather than its committed `.gitignore`. Users may override the location and tracking policy.

Four explicit human Approval Gates control progression:

1. Shape approval confirms shared understanding.
2. Spec approval confirms requirements, boundaries, decisions, and test seams.
3. Tickets approval confirms tracer-bullet slices and their dependency graph.
4. Accept confirms the mission-wide result and authorizes local integration.

After Tickets approval, Agentic Command runs autonomously unless it encounters a human decision, plan defect, exhausted retry budget, environmental blocker, or integration conflict.

Every Managed Run receives one isolated Git branch and worktree. Approved tickets execute sequentially in that shared Run Worktree. Each ticket begins from the previous ticket's verified commit, so dependent tickets inherit all accepted work naturally. An implementation worker cannot commit. After an independent verifier passes both the Spec and Standards axes, Agentic Command confirms that the reviewed change set is unchanged and creates one local Ticket Commit.

After all tickets succeed, an independent final integration verifier evaluates the approved mission across the complete branch. Fixable integration failures enter a bounded integration-repair loop. Final acceptance locally integrates the run branch into its selected target branch. Pushes, pull requests, history rewriting, and cleanup remain explicit actions outside automatic execution.

## User Stories

1. As a user with a rough engineering idea, I want to start a Managed Run before I have written a specification, so that Agentic Command helps me shape the work.
2. As a user with an existing specification, I want to import it and skip Shape authoring, so that I do not repeat completed work.
3. As a user with an existing ticket set, I want to import it and skip earlier authoring, so that I can move quickly to execution.
4. As a user importing an artifact, I want to approve its exact imported revision inside the run, so that execution never relies on assumed approval.
5. As a user, I want Shape to ask one consequential question at a time, so that I can reason about dependent decisions without being overwhelmed.
6. As a user, I want Shape to research facts available from the repository instead of asking me, so that my attention is reserved for actual decisions.
7. As a user, I want Shape to maintain recognized domain documentation when decisions crystallize, so that future work uses stable project language.
8. As a user, I want Shape writes limited to domain documentation, so that requirements discovery cannot modify application code.
9. As a user, I want Shape changes isolated from my checkout, so that collaborative documentation does not disturb unrelated work.
10. As a user, I want Shape approval to record the exact conversation and artifact revisions I accepted, so that shared understanding is auditable.
11. As a user, I want approved Shape documentation committed locally on the run branch, so that durable decisions are preserved before implementation.
12. As a user, I want Spec to synthesize the approved Shape context without interviewing me again, so that the workflow progresses rather than restarting discovery.
13. As a user, I want the Spec to state the problem from my perspective, so that implementation stays anchored to the intended outcome.
14. As a user, I want the Spec to describe the solution, user stories, implementation decisions, testing decisions, exclusions, and notes, so that it is a complete human-readable contract.
15. As a user, I want the Spec to use project domain terminology and respect architectural decisions, so that it fits the existing codebase.
16. As a user, I want the Spec to identify observable test seams, so that tickets can be verified through public behavior.
17. As a user, I want to approve new test seams explicitly, so that the workflow does not add unnecessary public interfaces.
18. As a user, I want to edit the Spec as Markdown in Agentic Command or in the Run Workspace, so that I am not constrained to machine-oriented forms.
19. As a user, I want every Spec edit to create a revision and invalidate approval, so that execution cannot use stale consent.
20. As a user, I want the previous approved Spec preserved for comparison, so that I can understand what changed.
21. As a user, I want Tickets generated from the approved Spec, so that decomposition remains traceable to agreed requirements.
22. As a user, I want tickets to default to tracer-bullet vertical slices, so that each ticket delivers observable behavior through all necessary layers.
23. As a user, I want each ticket independently verifiable and small enough for one fresh implementation context, so that failures remain bounded.
24. As a user, I want technical layer-only tickets rejected by default, so that the plan does not postpone integration risk.
25. As a user, I want explicit exceptions for prerequisite refactors, broad mechanical migrations, and indivisible infrastructure, so that legitimate non-vertical work remains possible.
26. As a user, I want wide migrations to use expand-migrate-contract sequencing, so that the repository stays usable throughout the change.
27. As a user, I want every ticket to declare blockers, so that Agentic Command can select only executable frontier work.
28. As a user, I want every ticket to identify an observable test seam, so that implementation and verification share the same behavioral contract.
29. As a user, I want TDD required when the agreed seam can reasonably be automated, so that behavior is demonstrated before and after implementation.
30. As a user, I want a documented exception when TDD is impractical, so that unusual work still has an explicit verification method.
31. As a user, I want to edit tickets as Markdown, so that ticket boundaries and acceptance criteria remain easy to revise.
32. As a user, I want to approve ticket granularity and dependency edges explicitly, so that automation begins only from a decomposition I trust.
33. As a user, I want edits to approved tickets to invalidate the execution snapshot, so that the scheduler cannot silently run changed work.
34. As a user, I want one isolated worktree and branch per Managed Run, so that automatic commits never mix with my existing checkout.
35. As a user, I want all tickets in a run to share that worktree sequentially, so that dependent tickets inherit previous verified work.
36. As a user, I want independent tickets to run sequentially initially, so that the first version avoids parallel integration complexity.
37. As a user, I want a reproducible committed base for the run, so that its starting state is unambiguous.
38. As a user with uncommitted changes, I want to be warned that they are excluded from the run, so that no work disappears unexpectedly.
39. As a user with uncommitted changes, I want to continue from committed HEAD, cancel and commit first, or select another base, so that Agentic Command never stashes or commits unrelated work for me.
40. As a user, I want each ticket to begin with a clean run worktree, so that its change set has an exact boundary.
41. As a user, I want a fresh implementation worker for each attempt, so that hidden conversational state cannot control execution.
42. As a user, I want implementation workers to receive only approved artifacts and necessary context, so that prompts remain focused.
43. As a user, I want implementation workers to report red and green evidence for automated TDD, so that the claimed development loop is inspectable.
44. As a user, I want one independent verifier after every implementation attempt, so that process success is not mistaken for behavioral success.
45. As a user, I want the verifier to evaluate both Spec and Standards, so that correctness and code quality are both required.
46. As a user, I want the Spec axis to evaluate acceptance criteria, test seams, behavior, and scope, so that the ticket delivers what was approved.
47. As a user, I want the Standards axis to evaluate repository guidance, maintainability, and significant design smells, so that passing behavior does not excuse harmful code.
48. As a user, I want failed verification feedback passed to a fresh implementation attempt, so that repair is focused and context remains bounded.
49. As a user, I want three implementation attempts by default, so that common failures can recover without looping indefinitely.
50. As a user, I want retry limits configurable before execution or while paused, so that I retain control over cost and persistence.
51. As a user, I want workers unable to grant themselves extra attempts, so that retry policy remains deterministic.
52. As a user, I want failed changes left intact after retries are exhausted, so that evidence and possible manual work are not destroyed.
53. As a user, I want exhausted retries to offer takeover, replanning, or confirmed restoration, so that I choose how to recover.
54. As a user, I want restoration treated as an explicitly confirmed destructive action, so that Agentic Command never discards work automatically.
55. As a user, I want the verifier to review the entire change set since the previous verified commit, so that omitted files cannot bypass review.
56. As a user, I want verification invalidated when the diff changes before commit, so that the committed SHA corresponds exactly to reviewed evidence.
57. As a user, I want unexpected external edits to pause the run, so that Agentic Command never guesses which changes belong to a ticket.
58. As a user, I want Agentic Command to create the ticket commit only after verification passes, so that every automatic commit is a verified checkpoint.
59. As a user, I want one commit per completed ticket, so that history is reviewable and bisectable.
60. As a user, I want repository commit-message guidance followed when present, so that automatic commits fit project conventions.
61. As a user, I want consistent recent history used only when it reveals a clear convention, so that weak inference does not generate strange messages.
62. As a user, I want a sensible fallback commit message when no convention exists, so that every ticket still produces readable history.
63. As a user, I want run and ticket identifiers attached when compatible with repository conventions, so that commits can be traced to local evidence.
64. As a user, I want repository branch conventions followed when present, so that run branches fit project practices.
65. As a user, I want a predictable `agentic/<run-slug>-<short-id>` fallback, so that branches are recognizable when no convention exists.
66. As a user, I want plan defects routed back to the appropriate Shape, Spec, or Tickets phase, so that repairs occur at the level where the mistake originated.
67. As a user, I want approved downstream artifacts marked stale after upstream revision, so that old approvals are never silently reused.
68. As a user, I want verified ticket commits preserved during replanning, so that accepted work is not erased.
69. As a user, I want to decide whether existing commits remain applicable to a revised plan, so that evidence is not assumed transferable.
70. As a user, I want final integration verification after every approved ticket succeeds, so that cross-ticket interactions and regressions are checked.
71. As a user, I want final verification to inspect mission criteria, the complete branch diff, broader tests, and both review axes, so that acceptance evidence covers the whole outcome.
72. As a user, I want fixable final failures converted into bounded integration-repair work, so that the run can finish without unnecessary intervention.
73. As a user, I want integration repair to use the same implement, verify, and commit discipline, so that repair commits are as trustworthy as planned tickets.
74. As a user, I want at most two integration-repair cycles by default, so that mission-level repair cannot loop forever.
75. As a user, I want changed scope or unresolved decisions to return to an Approval Gate, so that integration repair cannot expand the mission silently.
76. As a user, I want Accept enabled only after successful final integration verification, so that completion always has mission-wide evidence.
77. As a user, I want Accept to authorize local integration into my selected target branch, so that accepted work returns to the branch I chose.
78. As a user, I want a fast-forward integration when the target has not moved, so that history remains simple.
79. As a user, I want changed targets and proposed normal merges shown before integration, so that I understand the resulting history.
80. As a user, I want merge conflicts to pause for human action, so that Agentic Command never resolves ambiguity or rewrites history silently.
81. As a user, I want pushes and pull requests excluded from automatic execution, so that publication remains explicitly controlled.
82. As a user, I want the Run Workspace retained after acceptance, so that I can inspect specs, tickets, approvals, and evidence later.
83. As a user, I want archiving to hide a run without deleting its artifacts, so that tidying the UI does not destroy history.
84. As a user, I want artifact deletion to be a separate explicit action, so that cleanup is intentional.
85. As a user, I want minimal run metadata and commit SHAs retained after artifact deletion, so that the application can still explain what occurred.
86. As a user, I want run branches and worktrees retained after acceptance by default, so that I can inspect locally integrated work.
87. As a user, I want archive-time cleanup offered only when integration can be proven or deletion is separately confirmed, so that useful branches are not removed accidentally.
88. As a user, I want the active UI organized around Shape, Spec, Tickets, Implement, and Accept, so that current state and required action are obvious.
89. As a user, I want per-ticket verification visible within Implement, so that review is understood as part of delivery rather than a separate global phase.
90. As a user, I want final integration evidence visible within Accept, so that the final gate explains why the mission is ready.
91. As a user, I want the old Managed Run flow replaced without migration or compatibility machinery, so that the new model is not compromised by legacy states.

## Implementation Decisions

- Managed Run is the canonical term for the durable idea-to-acceptance workflow. Managed Session, execution loop, and task runner are not synonyms.
- The canonical phases are Shape, Spec, Tickets, Implement, and Accept.
- Verification is nested inside Implement for ticket attempts and inside Accept for mission-wide integration. It is not a peer authoring phase.
- Agentic Command owns workflow semantics natively. Provider prompts may implement those semantics, but installed skills and their names are not runtime dependencies.
- No external issue tracker integration is part of this rewrite.
- The Run Workspace defaults to `.agentic/runs/<run-id>/` and contains revisioned Markdown artifacts, approvals, projections, and evidence.
- Agentic Command adds the default Run Workspace root to `.git/info/exclude`. It does not modify the committed `.gitignore` unless the user explicitly requests a tracked project convention.
- Users may override the Run Workspace location and whether its artifacts are tracked.
- Runtime state may remain in Electron user data, but human-readable artifacts in the Run Workspace are canonical for Shape, Spec, and Tickets.
- Every downstream artifact records the exact upstream revision from which it was derived.
- Editing an approved artifact creates a new unapproved revision and marks affected downstream artifacts stale.
- Shape uses a persistent interactive worker. It asks one decision question at a time, researches facts from the environment, and stops only for genuine user decisions.
- Shape may write only recognized domain documentation in the isolated Run Worktree. When no domain-document convention exists, proposed domain material remains in the Run Workspace until the user approves creating project documentation.
- Shape approval records shared understanding and commits approved tracked domain-document changes on the run branch.
- Spec uses a fresh read-only worker supplied with the approved Shape transcript, approved domain artifacts, repository context, and relevant architectural decisions.
- The Spec is editable Markdown and contains Problem Statement, Solution, extensive User Stories, Implementation Decisions, Testing Decisions, Out of Scope, and Further Notes.
- The Spec defines the highest practical observable test seams. Existing seams are preferred; new seams require user confirmation.
- Tickets uses a fresh read-only worker supplied with the approved Spec and applicable domain and repository context.
- Tickets default to tracer-bullet vertical slices. Exceptions require an explicit reason and use an appropriate safe sequencing strategy.
- Each ticket records behavior, acceptance criteria, blockers, confirmed test seams, domain and decision references, execution context, capability tiers, verification guidance, and retry policy.
- The approved ticket set is the human-readable execution manifest. Strict structured task contracts are validated projections of those tickets for scheduler use.
- Imported specs and ticket sets may skip authoring but never skip the corresponding Managed Run Approval Gate.
- Every run uses one dedicated Git branch and isolated worktree. Tickets execute serially in that shared worktree.
- The run base is a selected committed revision. Uncommitted changes in the source checkout are excluded and never stashed, copied, or auto-committed.
- Repository guidance takes precedence for branch naming. A predictable `agentic/<run-slug>-<short-id>` form is the fallback.
- Every ticket starts from a clean Run Worktree at the previous verified commit.
- Implementation workers have workspace-write permission but may not commit, push, publish, rewrite history, delete files, or manage other workers.
- TDD is a validated ticket contract when the confirmed behavioral seam can reasonably be automated. Exceptions require an explanation and alternative verification method.
- Each implementation attempt is followed by one fresh independent read-only verifier.
- The verifier returns separate Spec and Standards assessments plus one structured scheduler verdict.
- The Spec assessment covers behavior, acceptance criteria, test seams, and scope. The Standards assessment covers documented repository conventions, maintainability, and significant design smells.
- The default ticket budget is three implementation attempts. Users may alter limits before execution or while paused; workers cannot extend limits.
- Failed changes remain uncommitted and intact when retries are exhausted. Manual takeover, replanning, and confirmed restoration are explicit recovery paths.
- The verifier reviews the complete working-tree change set since the previous verified commit, not merely implementer-reported files.
- A successful verdict is bound to a diff fingerprint. Any subsequent change invalidates verification before commit.
- Agentic Command, not a worker, creates the Ticket Commit from the entire unchanged verified change set.
- Repository commit-message guidance takes precedence, followed by a clearly established recent-history convention, followed by an Agentic Command fallback.
- Traceability metadata may be added through compatible commit trailers and is always recorded in Run Workspace evidence.
- Verified commits survive replanning. A revised approval explicitly determines whether completed work remains applicable or requires a reversal ticket.
- Final integration verification uses a fresh capable read-only worker and evaluates mission criteria, cross-ticket behavior, complete branch changes, broader tests, scope, and standards.
- A fixable final failure produces an internal integration-repair task without reopening ticket approval when it remains within the approved Spec.
- Integration repair uses the ordinary clean-boundary implementation, independent verification, and automatic commit protocol.
- Integration repair defaults to three attempts per repair task and at most two complete repair cycles. Plan defects, new scope, and human decisions return to the appropriate Approval Gate.
- Accept is enabled only after passing final integration verification.
- Accept authorizes local integration into the selected target branch. It fast-forwards when possible; a moved target requires a visible proposed merge, and conflicts pause for human action.
- Automatic push, pull-request creation, force operations, and history rewriting remain out of scope.
- Acceptance and archiving do not delete the run branch, worktree, or Run Workspace automatically.
- Legacy Managed Run persistence and behavior do not require migration, compatibility, or a parallel UI. New runs use the replacement model.

## Testing Decisions

- Tests observe public workflow behavior, persisted artifacts, Git state, and visible UI state. They do not assert private helper call order or incidental DOM structure.
- The authoritative seam is a deterministic Electron end-to-end Managed Run harness operating against a temporary real Git repository.
- The harness injects a scripted worker provider whose outcomes are controlled without invoking a network model. The rest of the application, IPC, persistence, filesystem, Git, renderer, and scheduler remain real.
- The primary happy-path scenario starts from a rough idea, drives all four Approval Gates, produces revisioned artifacts, executes dependent tickets sequentially, verifies both axes, creates one commit per ticket, passes integration verification, and locally integrates the run branch.
- The E2E harness inspects commit ancestry and changed files directly in the temporary repository so dependent-ticket inheritance and exact commit boundaries are externally demonstrated.
- The E2E harness verifies that the source checkout's unrelated uncommitted changes remain untouched and excluded from the run baseline.
- The E2E harness changes a reviewed diff before commit and observes verification invalidation rather than an unsafe commit.
- The E2E harness exercises `fix_required`, bounded retry, exhausted retry, and preservation of the failed diff.
- The E2E harness revises an approved upstream artifact and observes approval invalidation plus stale downstream artifacts.
- The E2E harness exercises a fixable final integration failure, an integration-repair commit, and successful reverification.
- The E2E harness moves the target branch and verifies visible merge handling; it also creates a conflict and observes a human-action state without automatic resolution.
- The E2E harness verifies that Accept performs local integration but never pushes.
- The E2E harness verifies retention, archive behavior, and separately confirmed cleanup.
- Focused service tests cover Markdown parsing, artifact revision lineage, dependency validation, cycle rejection, structured projection validation, state transitions, retry budgets, stale propagation, diff fingerprinting, convention resolution, and recovery after restart.
- Focused Git integration tests use temporary repositories to cover worktree creation, branch naming, clean-boundary enforcement, automatic commit authorship and messages, fast-forward integration, merge conflict detection, and safe cleanup eligibility.
- Renderer tests cover accessible phase navigation, Approval Gate controls, Markdown editing state, stale indicators, two-axis evidence, retry status, and narrow-viewport behavior.
- Existing Managed Run E2E and scheduler tests are replaced or rewritten around the new public workflow rather than retained as legacy compatibility assertions.

## Out of Scope

- GitHub, Linear, Jira, or other external issue-tracker integration.
- Literal invocation of Matt Pocock's installed skills or slash commands.
- Migration or continued execution of persisted legacy Managed Runs.
- A permanent legacy Managed Runs interface alongside the replacement workflow.
- Parallel ticket implementation or per-ticket worktrees.
- Automatic push, pull-request creation, publication, force-push, rebasing, or history rewriting.
- Automatic conflict resolution.
- Automatic deletion of failed changes, Run Workspaces, run branches, or worktrees.
- Including pre-existing uncommitted source-checkout changes in a run automatically.
- Allowing implementation workers to create commits.
- Unbounded implementation or integration-repair loops.
- Treating local system-temporary storage as the canonical artifact location.

## Further Notes

- The workflow is inspired by the artifact progression of `grill-with-docs -> to-spec -> to-tickets -> implement`, but the product owns the semantics and terminology independently.
- The existing deterministic scheduler, provider adapters, permission separation, protected evidence, retry classifications, and token accounting are valuable foundations even though the current user-facing lifecycle and persistence schema may be replaced.
- Shape, Spec, and Tickets should hand off through explicit artifacts rather than one long agent conversation. Only Shape requires a persistent interactive conversation.
- Run Workspace artifacts are locally ignored by default but intentionally durable. Archive and delete are different operations.
- Local automatic commits are execution evidence and recovery checkpoints. Publication remains a separate concern.
