# Managed Runs: Product and Scope

Status: Approved specification

## Purpose

Managed Runs reduce agent babysitting and premium-model token spend while preserving high-quality implementation and independent verification.

Agentic Command coordinates specialized coding CLI workers from outside their conversations. A deterministic scheduler manages routine execution. A local or inexpensive model assists only where limited judgment is useful.

## Product boundary

Managed Runs are a new mode alongside existing interactive PTY sessions. They do not replace or silently alter interactive sessions.

A Managed Run contains:

- A human-approved specification and plan.
- Ordered task contracts and dependencies.
- Independent implementation and verification worker sessions.
- Retry, escalation, pause, and takeover controls.
- A final integration verification and human-readable report.
- Execution and token-usage evidence.

## Goals

- Remove the need to manually start a verifier after every implementation.
- Keep premium models focused on planning, difficult implementation, and integration judgment.
- Avoid paying a premium parent agent to supervise subagents.
- Make execution state, evidence, costs, and failures inspectable.
- Maintain human control over requirements, plans, permissions, and publication.
- Support Codex, Claude Code, OpenCode, and future coding CLIs through adapters.

## Non-goals for the MVP

- Replacing interactive terminal sessions.
- Fully automating requirements discovery or plan approval.
- Parallel editing of one working tree.
- Transparent model switching inside a running worker conversation.
- Automatically committing, pushing, deleting files, or opening pull requests.
- Allowing a local model to write code or execute arbitrary actions.

## Operating principles

1. Normal workflow transitions are deterministic code, not LLM decisions.
2. Planning is interactive, uses a capable model, and requires explicit human approval.
3. Implementation and verification are separate worker sessions.
4. Every implementation attempt is independently verified.
5. Workers receive compact task packets rather than complete orchestration history.
6. Model selection uses capability tiers and is measurable and overridable.
7. Humans can pause, cancel, retry, edit, replan, or take over.
8. Publication and destructive operations require separate explicit approval.

## Spec map

- `01-planning-and-task-contracts.md`: shaping, planning, approval, and task schema.
- `02-scheduler-and-state-machine.md`: deterministic orchestration lifecycle.
- `03-workers-model-routing-and-context.md`: provider adapters, model tiers, and context limits.
- `04-verification-retries-and-human-controls.md`: verification loops and escalation.
- `05-agentic-command-integration.md`: services, IPC, persistence, and UI integration.
- `06-security-persistence-and-token-metrics.md`: safety, evidence, privacy, and metrics.
- `07-mvp-acceptance-criteria.md`: deliverable boundary and observable completion criteria.
