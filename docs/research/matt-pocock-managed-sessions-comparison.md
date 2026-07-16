# Matt Pocock's Engineering Workflow and Managed Runs

Research date: 2026-07-15

## Executive conclusion

Yes: Managed Runs can be rewritten around the conceptual flow

`grill-with-docs -> to-spec -> to-tickets -> implement`

but the best fit is **not** a literal replacement of the existing scheduler. Matt Pocock's workflow is a human-driven progression that turns conversation into increasingly executable artifacts. Agentic Command's Managed Runs already supplies a more rigorous execution runtime: validated task contracts, dependency scheduling, one bounded implementation attempt at a time, independent read-only verification after every attempt, bounded retries, final integration verification, and human acceptance.

The strongest product direction is therefore:

1. Adopt Matt's four named phases as the user-facing journey and artifact model.
2. Retain Managed Runs' deterministic scheduler and independent verification as the machinery beneath `Implement`.
3. Treat the approved ticket set—not an opaque planner-generated task list—as the execution manifest.
4. Keep verification visible as part of each ticket's implementation lifecycle and as a final mission gate, rather than presenting `Verify` as a competing top-level authoring phase.

In short: **Matt's workflow is a better front half; Managed Runs is a stronger back half.**

## Sources and scope

This report uses only first-party sources:

- Matt Pocock's [`skills/engineering` README](https://github.com/mattpocock/skills/tree/main/skills/engineering) and the skill definitions for [`grill-with-docs`](https://github.com/mattpocock/skills/blob/main/skills/engineering/grill-with-docs/SKILL.md), [`to-spec`](https://github.com/mattpocock/skills/blob/main/skills/engineering/to-spec/SKILL.md), [`to-tickets`](https://github.com/mattpocock/skills/blob/main/skills/engineering/to-tickets/SKILL.md), and [`implement`](https://github.com/mattpocock/skills/blob/main/skills/engineering/implement/SKILL.md).
- The directly invoked supporting skills: [`domain-modeling`](https://github.com/mattpocock/skills/blob/main/skills/engineering/domain-modeling/SKILL.md), [`tdd`](https://github.com/mattpocock/skills/blob/main/skills/engineering/tdd/SKILL.md), [`code-review`](https://github.com/mattpocock/skills/blob/main/skills/engineering/code-review/SKILL.md), and [`setup-matt-pocock-skills`](https://github.com/mattpocock/skills/blob/main/skills/engineering/setup-matt-pocock-skills/SKILL.md).
- Agentic Command's approved Managed Runs specifications and current service prompts: [`00-product-and-scope.md`](../specs/managed-runs/00-product-and-scope.md), [`01-planning-and-task-contracts.md`](../specs/managed-runs/01-planning-and-task-contracts.md), [`02-scheduler-and-state-machine.md`](../specs/managed-runs/02-scheduler-and-state-machine.md), [`04-verification-retries-and-human-controls.md`](../specs/managed-runs/04-verification-retries-and-human-controls.md), [`07-mvp-acceptance-criteria.md`](../specs/managed-runs/07-mvp-acceptance-criteria.md), [`managedRunService.js`](../../src/main/services/managedRunService.js), and [`taskSchedulerService.js`](../../src/main/services/taskSchedulerService.js).

The GitHub links point to `main`, so they describe the repository as observed on the research date rather than a permanently pinned revision.

## The exact Matt Pocock flow

### 0. One-time repository setup

The engineering skills assume a repository-level scaffold created by `setup-matt-pocock-skills`. Setup explores the repo, asks the user to confirm the issue tracker, optionally establishes canonical triage-label names, chooses a single- or multi-context domain-document layout, and then writes agent guidance under `docs/agents/` plus an `Agent skills` section in `CLAUDE.md` or `AGENTS.md`. GitHub is the default issue tracker when the remote points there; local Markdown issues are explicitly supported as an alternative.

This matters because the workflow is not stateless prompt chaining. Its durable state includes:

- Issue-tracker configuration.
- The `ready-for-agent` workflow label.
- A domain glossary in `CONTEXT.md` (or context-specific equivalents).
- Architectural decisions in `docs/adr/`.
- Published specs and tickets in a real tracker or local `.scratch` files.

Source: [`setup-matt-pocock-skills`](https://github.com/mattpocock/skills/blob/main/skills/engineering/setup-matt-pocock-skills/SKILL.md).

### 1. `grill-with-docs`: resolve decisions while documenting the domain

The skill itself is deliberately tiny: it composes a grilling session with domain modeling. The grilling discipline is a relentless, one-question-at-a-time interview. Facts discoverable from the environment should be researched rather than asked; genuine decisions belong to the user; no implementation begins until both sides agree that shared understanding has been reached.

The `domain-modeling` half continuously sharpens terminology, checks claims against code, stress-tests the model with concrete edge cases, and writes resolved terms to `CONTEXT.md` immediately. It offers an ADR only when a choice is hard to reverse, surprising without context, and the result of a real trade-off. `CONTEXT.md` remains a glossary, not a spec or implementation notebook.

**Input:** the current idea, plan, or design; repository code and existing domain/ADR documents.

**Output:** shared understanding plus incremental durable edits to domain glossary and, sparingly, ADRs. There is no prescribed spec document or ticket output at this stage.

**Gate:** the interview proceeds one decision at a time and does not act on the idea until the user confirms shared understanding.

**Iteration:** conversational branching continues until dependencies among decisions have been resolved.

**Verification:** factual claims are checked against the environment/code; domain scenarios are stress-tested. This is decision validation, not test-suite verification.

Sources: [`grill-with-docs`](https://github.com/mattpocock/skills/blob/main/skills/engineering/grill-with-docs/SKILL.md) and [`domain-modeling`](https://github.com/mattpocock/skills/blob/main/skills/engineering/domain-modeling/SKILL.md).

### 2. `to-spec`: synthesize the conversation into one approved issue

`to-spec` explicitly does **not** interview the user again. It synthesizes current conversation context and codebase understanding, first exploring the repository if needed. It uses glossary vocabulary and respects relevant ADRs.

Before publishing, it identifies the highest practical public seam at which the feature should be tested, preferring existing seams and minimizing the number of new ones. If new seams are required, it asks the user to confirm them.

The resulting spec has these sections:

- Problem Statement.
- Solution.
- A long, numbered set of User Stories.
- Implementation Decisions.
- Testing Decisions.
- Out of Scope.
- Further Notes.

Implementation decisions may name modules, interfaces, architectural choices, schemas, API contracts, and interactions, but deliberately avoid file paths and code snippets because they become stale. A decision-rich snippet from a prototype is the narrow exception.

**Input:** the current conversation, repo understanding, glossary, ADRs, and issue-tracker configuration.

**Output:** one published spec/PRD in the configured issue tracker, labeled `ready-for-agent`.

**Gate:** explicit user confirmation is required only for proposed test seams; the rest is synthesis, not another requirements interview.

**Iteration:** no formal spec-revision loop is defined by the skill, though the seam check can iterate with the user.

**Verification:** repository exploration, domain-language consistency, ADR compliance, and explicit testing-seam design. It does not run implementation tests.

Source: [`to-spec`](https://github.com/mattpocock/skills/blob/main/skills/engineering/to-spec/SKILL.md).

### 3. `to-tickets`: turn the spec into a dependency graph of tracer bullets

`to-tickets` accepts a plan, spec, conversation, local path, or issue reference. When given an issue or URL, it reads the full body and comments. It may explore the codebase, uses the glossary and ADRs, and looks for prefactoring that makes later work easier.

The normal decomposition unit is a **tracer-bullet vertical slice**: a narrow but complete behavior through all necessary layers, independently demoable/verifiable, and small enough for one fresh context window. Every ticket declares blocking edges. Wide mechanical refactors are an explicit exception and use expand-migrate-contract sequencing so the codebase stays green, with an integration branch/final verification ticket only when individual migration batches cannot stay green.

Before anything is published, the skill presents a numbered draft containing each title, blockers, and end-to-end delivery. It quizzes the user on granularity, dependency correctness, and merge/split choices, iterating until approval.

**Input:** an existing spec/plan/conversation, plus repository and tracker/domain context.

**Output:** one tracker item per approved ticket, created in dependency order. Local mode writes one Markdown file per ticket under `.scratch/.../issues/`; real trackers get one issue per ticket and native blocking links where available. Each ticket has a user-facing behavior, acceptance criteria, blockers, optional parent reference, and `ready-for-agent` status.

**Gate:** explicit user approval of ticket granularity and dependency edges before publication.

**Iteration:** the ticket draft is repeatedly merged, split, or reordered until approved.

**Verification:** each slice must be independently demoable or verifiable; acceptance criteria are recorded. No code is verified yet.

**Execution handoff:** work the dependency **frontier** one ticket at a time with `/implement`, clearing context between tickets. A frontier ticket is one whose blockers are all complete.

Source: [`to-tickets`](https://github.com/mattpocock/skills/blob/main/skills/engineering/to-tickets/SKILL.md).

### 4. `implement`: implement one selected unit, test it, review it, commit it

`implement` is concise. It implements the work described by the supplied spec or tickets, uses TDD where possible at the pre-agreed seams, runs typechecking and individual test files regularly, runs the full test suite once at the end, invokes `code-review`, and commits to the current branch.

The referenced TDD discipline is one vertical slice at a time: agree on a public test seam, write one failing behavioral test, add the minimum implementation to pass, and repeat. Tests must observe public behavior rather than internals. Refactoring is intentionally deferred from the red-green loop to review.

The final `code-review` is a two-axis diff review against a fixed point:

- **Standards:** documented repository conventions plus a code-smell baseline.
- **Spec:** missing/partial requirements, scope creep, and apparently incorrect implementations.

Those reviews run independently in parallel sub-agents and are reported side-by-side. The review skill requires a fixed point and tries to locate the originating spec from commits, user input, or repository documents.

**Input:** a spec or ticket(s), confirmed test seams, codebase, and a review fixed point/spec source.

**Output:** code changes, behavioral tests, check results, two-axis review findings, and a commit on the current branch.

**Gate:** test seams are pre-agreed; tests go red before green; final review occurs before commit.

**Iteration:** red-green cycles occur within the implementation; the larger workflow clears context and repeats `/implement` for the next unblocked ticket. The skill does not define an automated retry counter or a verifier-to-implementer feedback state machine.

**Verification:** frequent typechecking and focused tests, one full suite at the end, then standards/spec review. The reviewer is independent at the sub-agent context level, but the published skill does not require a separate read-only process after each implementation attempt.

Sources: [`implement`](https://github.com/mattpocock/skills/blob/main/skills/engineering/implement/SKILL.md), [`tdd`](https://github.com/mattpocock/skills/blob/main/skills/engineering/tdd/SKILL.md), and [`code-review`](https://github.com/mattpocock/skills/blob/main/skills/engineering/code-review/SKILL.md).

## Comparison with current Managed Runs

| Concern | Matt workflow | Current Managed Runs | Implication |
|---|---|---|---|
| Requirements discovery | One-question-at-a-time grilling; facts researched; decisions stay with user | User supplies a specification; a planning worker generates a plan; `/grill-me` is suggested but not modeled as a durable phase | Add a first-class shaping phase rather than treating the initial text box as sufficient requirements input |
| Domain model | `CONTEXT.md` updated inline; ADRs created selectively | No glossary or ADR artifact in the run contract | Link or snapshot domain decisions as planning inputs; avoid duplicating glossary content inside every task |
| Spec | Published user-facing problem/solution/stories/decisions/testing/out-of-scope artifact | Initial free-form specification plus planner-generated JSON objective/constraints/tasks | Separate the durable spec from the executable plan; keep both rather than forcing one JSON object to play both roles |
| Test design | Test seams explicitly chosen and user-confirmed during spec creation | Tasks contain verification guidance and success criteria, but no explicit test-seam concept | Add mission/ticket test seams as canonical fields or referenced decisions |
| Work decomposition | Human-approved tracer-bullet tickets with blocking graph; one fresh context per ticket | Planner-generated ordered task contracts/dependencies; user can edit/approve the plan | Recast task contracts as executable projections of approved tickets; add a ticket-breakdown approval checkpoint |
| Unit of execution | One frontier ticket at a time, context cleared between tickets | First executable task whose dependencies succeeded; compact new worker per attempt | Already strongly aligned |
| Implementer checks | TDD where possible, frequent focused checks/typecheck, full suite at the end | Implementer runs appropriate checks and returns structured JSON | Enrich implementation packets with confirmed seams and explicit focused/full-suite policy |
| Per-ticket verification | Implement skill ends with two-axis review before committing | Every attempt gets a separate read-only verifier with structured verdict | Managed Runs is materially stronger; retain this behavior |
| Retry behavior | No specified bounded automated retry loop | `fix_required` feeds compact verifier feedback into another attempt; default three attempts total | Retain Managed Runs' bounded retry mechanism |
| Plan defects/decisions | Resolved mainly before implementation through grilling and ticket approval | Structured verifier verdicts can stop for replanning or a human decision | Retain runtime escape hatches; route them visibly back to Shape/Spec/Tickets |
| Final verification | Full test suite at end of `/implement`, then code review | Separate final read-only integration verifier after all tasks succeed | Retain Managed Runs' mission-wide gate; optionally use Standards/Spec axes within it |
| Completion | Implement commits current branch; tickets are worked one at a time | No commit/push; final pass moves to human review, and only user acceptance completes | Product decision required: keep publication outside the run, but consider an explicitly approved commit action after acceptance |
| Persistence | Docs plus issue tracker are the durable artifacts; conversation connects phases | Versioned local run document contains plan, tasks, workers, evidence, usage, approval metadata | Preserve local runtime state but attach tracker/doc identifiers as artifact lineage |

## What should be rewritten

### Recommended user-facing journey

Use five visible stations:

1. **Shape** — the `grill-with-docs` experience: resolve decisions and update domain docs.
2. **Spec** — synthesize and approve the product/technical contract, including test seams.
3. **Tickets** — approve tracer-bullet slices and their dependency graph.
4. **Implement** — work the frontier serially; each ticket expands to implementation attempts and independent verification.
5. **Accept** — run mission-wide verification, present evidence, and require human acceptance.

This preserves the spirit of the named four-skill flow while making the existing final verification/human gate legible. `Verify` should appear inside the Implement station for every ticket and inside Accept for the whole mission, not as a peer authoring step that suggests verification happens only once after all coding.

### Recommended artifact lineage

Model explicit, revisioned handoffs:

```text
Shaping conversation
  -> domain glossary / ADR revisions
  -> approved spec revision
  -> approved ticket-set revision
  -> immutable execution snapshot
  -> per-ticket attempts + verification evidence
  -> final integration evidence
  -> human acceptance
```

Every downstream artifact should record which upstream revision produced it. Editing a spec should invalidate ticket approval; editing tickets should invalidate the execution snapshot. Already accepted ticket evidence may remain attached, but a user must decide whether it still applies—consistent with current replanning rules.

### Recommended ticket execution contract

Keep the current structured task fields, but derive them from an approved ticket and add lineage/testing fields:

- Ticket/tracker identifier and source revision.
- User-facing behavior and acceptance criteria.
- Blocking ticket identifiers.
- Confirmed public test seam(s).
- Relevant domain-context and ADR references.
- Bounded implementation objective and context notes.
- Implementation and verification tiers.
- Verification guidance and retry limit.

The tracker ticket stays human-readable and durable. The executable contract remains strict JSON for validation and scheduling. This matches Agentic Command's existing human-editable Markdown/structured-runtime split.

### Recommended execution loop

For each frontier ticket:

1. Create a fresh implementation worker with only the approved spec summary, ticket contract, domain/ADR references, confirmed seams, repository state, and latest verifier feedback if retrying.
2. Encourage red-green vertical slices and require reported focused checks.
3. Launch the existing independent read-only verifier.
4. Make verification explicitly two-axis:
   - **Acceptance/Spec:** does behavior satisfy the ticket and avoid scope creep?
   - **Standards:** does the diff respect repository conventions and reveal significant design smells?
5. On `fix_required`, retry within the bounded budget using concise feedback.
6. On `plan_defect`, return to Tickets or Spec depending on the defect's level.
7. On `human_decision_required`, return to Shape and record the resolved term/decision before regenerating affected artifacts.
8. Mark the ticket complete only on verifier evidence; then select the next frontier ticket.

After the frontier is empty, run the current final integration verifier against mission criteria, complete diff, cross-ticket interactions, full relevant suite, and Standards/Spec axes. Human acceptance remains the final state transition.

## Important semantic differences not to blur

1. **Matt's `to-spec` publishes the spec to an issue tracker.** Managed Runs currently keeps the mission locally. Adopting the flow requires an explicit local-vs-tracker choice; tracker publication should not become an accidental side effect.
2. **Matt's `to-tickets` is deliberately human-approved.** Automatically accepting planner-generated tasks would miss one of the workflow's most important quality gates.
3. **Matt's `/implement` commits.** Managed Runs explicitly forbids commit/push/publication. This should remain a separate, explicit policy choice, not silently change because the skill uses the word `implement`.
4. **Matt's code review is not the same as Managed Runs verification.** It reviews a diff along Standards and Spec axes; Managed Runs also supplies process isolation, structured verdicts, retry classification, and evidence-driven state transitions. Use the review axes inside the verifier without weakening the verifier contract.
5. **The four skills do not form an autonomous loop by themselves.** They rely on user invocation, approval, context clearing, and tracker state. Managed Runs can automate the mechanical frontier loop only after the user has approved the artifacts.

## Suggested scope for a rewrite

### MVP rewrite

- Rename/reframe the journey around Shape, Spec, Tickets, Implement, Accept.
- Allow a user to start from any existing artifact (conversation text, spec, or ticket set) and mark earlier phases as imported.
- Introduce revisioned spec and ticket-set artifacts with explicit approval.
- Generate structured task contracts from approved tickets rather than directly from the initial prompt.
- Add confirmed test seams to spec/ticket execution context.
- Preserve current task scheduling, read-only per-attempt verification, retries, final integration verification, and human acceptance.
- Add artifact lineage and route verifier defects back to the correct phase.

### Later

- Optional GitHub/Linear/local-Markdown tracker adapters.
- Inline domain glossary and ADR editing during Shape.
- Expand-contract modeling for wide refactors.
- Explicit, human-approved commit/publish action after acceptance.
- Parallel frontier tickets in isolated worktrees after serial behavior is proven.

## Final assessment

The concepts are highly compatible. Current Managed Runs already implements most of what happens **after** `to-tickets`: dependency-aware frontier selection, fresh bounded workers, compact handoffs, verification, retries, replanning, and final acceptance. Its weak spot relative to Matt's workflow is the **artifact-shaping pipeline before execution**: domain decisions, a recognizable spec, explicit test seams, tracer-bullet decomposition, and a dedicated human approval of ticket boundaries.

Rewriting the idea around those artifacts would make Managed Runs easier to understand and likely produce better work. The key architectural choice is to treat skills as phase semantics and reusable interaction patterns—not as the scheduler itself. Agentic Command should own durable state, validation, permissions, retries, and evidence; the skills should shape what enters that engine.
