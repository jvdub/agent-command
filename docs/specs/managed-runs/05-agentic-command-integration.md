# Agentic Command Integration

Status: Approved specification

## Integration approach

Managed Runs are implemented within Agentic Command's existing Electron architecture. Superintendent's domain concepts may be ported, but its HTTP server and browser UI are not embedded.

The renderer remains sandboxed and communicates through the shared IPC contract and preload bridge.

## Main-process services

Add compartmentalized services:

- `managedRunService`: run creation, plan revisions, approval, and high-level lifecycle.
- `taskSchedulerService`: deterministic task selection and transitions.
- `workerProviderRegistry`: provider discovery, configuration, and capabilities.
- `workerProcessService`: non-interactive process launch, streaming, cancellation, and outcomes.
- `localInferenceService`: provider-neutral local inference with an initial Ollama-compatible adapter.
- `managedRunPersistenceService`: versioned state, artifacts, and recovery.
- `tokenLedgerService`: normalized usage, duration, attempts, and outcome metrics.

Services are registered through the existing main-process service registry. IPC handlers validate and shape requests but do not contain orchestration policy.

## IPC domains

Define dedicated Managed Run channels for:

- Create, read, list, and archive runs.
- Start shaping or planning.
- Save, validate, and approve plan revisions.
- Start, pause, resume, cancel, and retry execution.
- Apply human overrides.
- Read tasks, worker attempts, events, evidence, and usage.
- Subscribe to run, task, worker-output, and attention events.

The preload bridge exposes narrow methods and subscriptions. It must not expose process spawning, filesystem primitives, or local-model HTTP access directly to the renderer.

## UI model

Managed Runs appear as a distinct navigation surface with:

- Mission status and current action.
- Specification and approved plan revision.
- Hierarchical tasks with implementation and verification attempts.
- Worker role, provider, tier, resolved model, state, and duration.
- Streaming output and command preview.
- Diff and verification evidence.
- Token and attempt summaries.
- Pause, cancel, retry, override, replan, takeover, and final-accept controls.

Every worker attempt remains inspectable like a session, but its orchestration metadata is not inferred from terminal text.

## Event flow

```text
Renderer action
  -> preload/IPC
  -> managedRunService
  -> taskSchedulerService
  -> workerProcessService/provider adapter
  -> structured lifecycle events + output stream
  -> persistence and token ledger
  -> renderer subscriptions
```

PTY heuristics may continue to support interactive-session attention states. Managed Run correctness must use structured worker events and outcomes instead of screen scraping.

## Working-tree coordination

The service records the repository root and obtains an editing lock before launching an implementation worker. A conflicting Managed Run cannot begin editing the same working tree.

Workspace change views and file editing should reuse existing Agentic Command services where their security and performance boundaries fit.

## Local inference configuration

The first adapter targets an Ollama-compatible local API. The service interface remains provider-neutral so another local runtime can be added without changing scheduler or renderer behavior.
