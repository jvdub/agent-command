# Workers, Model Routing, and Context

Status: Approved specification

## Worker ownership

Agentic Command launches implementation, verification, planning, and final-review workers as independent non-interactive CLI processes.

The system does not keep a premium parent agent alive to create or supervise its own subagents. Worker lifecycle, evidence, retry, and routing are owned externally by Agentic Command.

## Worker roles

- `planner`: repository-aware plan creation; read-only.
- `implementer`: one bounded task attempt; workspace-write.
- `verifier`: independent review of one implementation attempt; read-only.
- `integration_verifier`: mission-wide review after all tasks pass; read-only.

Each worker returns a structured outcome plus its raw stdout and stderr.

## Capability tiers

Plans and policies refer to capability tiers rather than fixed model names:

- `local`: classification, compression, and limited operational judgment.
- `economy`: mechanical or narrowly bounded coding tasks.
- `standard`: ordinary implementation and verification.
- `premium`: planning, architecture, difficult debugging, and final integration review.

Provider configuration maps each tier to a provider and model. The user may override the mapping or a specific task assignment before or during a paused run.

The MVP does not autonomously change a running worker's model. A routing change applies to a new worker attempt or a new task.

## CLI model designation

Provider adapters must use the CLI `--model` flag when launching a session with a model other than that provider's configured default:

```text
<command> <role arguments> --model <resolved-model>
```

Rules:

- Omit `--model` when the resolved model is the configured provider default.
- Include `--model` and the exact resolved model when using any non-default model.
- Construct command arguments as an array; do not concatenate an unescaped shell command.
- Display the complete command preview, including the selected model, before launch.
- Persist the requested tier, resolved provider, resolved model, and whether `--model` was supplied.
- Reject a non-default launch when the adapter cannot designate its model reliably.
- Provider-specific differences must remain inside adapters and must not leak into scheduler logic.

## Adapter capabilities

Each provider adapter declares whether it supports:

- Non-interactive execution.
- Structured or streaming output.
- Read-only and workspace-write modes.
- Model selection through `--model`.
- Session resume.
- Turn or token limits.
- Cancellation.
- Usage metadata.

Capability checks occur before execution. Missing required capabilities produce a visible configuration error rather than silently weakening policy.

## Compact worker packet

A worker receives only the information required for its role:

- Mission summary and applicable constraints.
- Approved plan revision identifier.
- Its task contract or final-verification contract.
- Relevant success criteria.
- Repository path and permission mode.
- Latest verifier feedback when retrying.
- Explicit structured outcome schema.
- Safety and publication restrictions.

Workers do not automatically receive complete planning conversations, other task transcripts, scheduler reasoning, or every prior retry. Full evidence remains available to humans and may be attached deliberately when needed.

## Routing policy evolution

For the MVP, plan assignments and user overrides control tiers. A local model may recommend changes but cannot apply them without a deterministic policy or user action.

Future automatic routing must be based on recorded outcomes such as success rate, retries, latency, token use, task category, and escalation frequency.
