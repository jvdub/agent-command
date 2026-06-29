# Security, Persistence, and Token Metrics

Status: Approved specification

## Permission policy

- Planning, per-task verification, and final integration verification are read-only.
- Implementation workers receive workspace-write access limited to the selected repository.
- Managed Runs do not commit, push, force-push, publish, delete files, or open pull requests without a separate explicit human-approved action.
- A worker request to broaden permissions stops for human review.
- Provider adapters fail closed when the requested permission mode cannot be enforced.

These restrictions appear in worker prompts, process configuration, command previews, and outcome records. Prompt instructions do not replace operating-system or CLI enforcement.

## Local-model safety

The local model receives compact mission state and bounded output excerpts. It selects from fixed schemas and cannot directly invoke commands, edit files, or mutate run state.

All decisions are validated. Deterministic scheduler guards override invalid, stale, or unsafe recommendations.

## Persistence

Persist a versioned Managed Run document containing:

- Mission and plan revisions.
- Approval records.
- Task contracts and transitions.
- Worker attempts and structured outcomes.
- Command previews and process exit data.
- Git status, changed files, and diff summaries.
- Human overrides and audit events.
- Usage and timing metrics.

State is written atomically before and after lifecycle transitions. Interrupted workers are recovered as interrupted, never successful.

Sensitive worker output follows Agentic Command's protected local-history policy. When protected storage is unavailable, sensitive transcripts are omitted from durable storage rather than written in plaintext.

## Evidence handling

- Bound stored and rendered output sizes.
- Preserve raw evidence separately from compact machine context.
- Remove ANSI/control sequences before local-model analysis.
- Avoid sending secrets, full environment variables, or credentials to the local model.
- Record when output was truncated or unavailable.
- Keep all Managed Run data local unless a configured worker provider necessarily transmits its prompt and repository context.

## Token and execution ledger

Record per worker attempt when available:

- Worker role.
- Provider and resolved model.
- Requested capability tier.
- Whether a non-default `--model` argument was used.
- Input, output, cached, and reasoning tokens when exposed.
- Turns or tool calls when exposed.
- Runtime and queue time.
- Attempt number and retry cause.
- Verification verdict and final outcome.
- Estimated or reported cost when available.

Unavailable values remain explicitly unknown; they are not estimated silently.

## Product metrics

The MVP must make these questions answerable:

- How many premium worker calls did the run require?
- How many tasks passed on the first attempt?
- Which tiers caused retries or escalation?
- How much token usage occurred in planning, implementation, verification, and local orchestration?
- Did the managed workflow use less premium-model context than an equivalent parent-orchestrator session?
- How often did a human need to intervene?

Automatic routing remains experimental until recorded outcomes demonstrate acceptable quality and savings.
