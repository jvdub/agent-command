# Agentic Command

Desktop wrapper for interactive agent CLIs running inside a real pseudo-terminal.

## Platform support

Agentic Command v1 is tested and supported on native Windows and native Linux.
macOS and WSL/WSLg are not release targets yet.

## What it does

- Starts an agent command in a chosen working directory.
- Supports multiple concurrent sessions, each with its own PTY process.
- Preserves interactive terminal behavior through `node-pty`, including prompts, permission requests, and follow-up questions.
- Keeps a persistent left sidebar for launching, switching, restarting, and removing sessions.
- Opens the selected agent terminal beside workspace changes and manual shell terminals.
- Supports quick-open workspace navigation, modified-file inspection, and in-app file editing.
- Surfaces per-session attention states so you can quickly triage which agents need input.
- Supports system, light, and dark appearance modes.
- Runs human-approved Managed Runs with independent implementation and verification workers.
- Routes Managed Run roles through configurable provider/model tiers and records available token usage.

## Multi-session architecture

The app now uses a session manager model instead of a single global PTY.

- Main process (`src/main.js`):
  - Maintains a `Map` of sessions keyed by `sessionId`.
  - Spawns one `node-pty` process per session.
  - Routes terminal events as payloads that include `sessionId`.
  - Exposes `sessions:list` and emits `sessions:changed` for live command-center updates.
  - Handles `session:write`, `session:resize`, and `session:stop` per session.
- Preload bridge (`src/preload.js`):
  - Exposes a multi-session IPC API (`listSessions`, `startSession`, `stopSession(sessionId)`, `writeToSession(sessionId, input)`, `resizeSession(sessionId, size)`).
  - Exposes event subscriptions for session stream and session list changes.
- Renderer (`src/renderer/app.js` + `src/renderer/index.html`):
  - Implements a persistent sidebar plus a split terminal and workspace view.
  - Stores session metadata and output buffers per `sessionId`.
  - Derives attention states from PTY output heuristics: permission prompts, question prompts, idle sessions, and errors.
  - Clicking a session tab switches the active terminal without tearing down running sessions.

## Current target

The default command target is `claude`, which starts a normal interactive Claude CLI session when available in your shell. The command field stays editable so you can swap in a different agent later.

## Managed Runs

Managed Runs automate the mechanical orchestration loop without keeping a premium parent agent alive. A capable worker creates a structured plan, the user edits and approves it, and Agentic Command then runs one bounded implementation task at a time. Every implementation attempt receives an independent read-only verification, failed verification can feed a bounded retry, and a final integration verifier checks the complete mission before human acceptance.

Managed Runs never commit, push, delete files, publish, or open pull requests. Planning and verification workers are read-only; only implementation workers receive workspace-write access.

When a selected target folder is not yet a Git repository, Agentic Command asks before running `git init`. Cancelling the prompt leaves the folder unchanged.

Codex, Claude Code, and OpenCode adapters are available. Model assignments use role/tier configuration. When a resolved model differs from the provider default, Agentic Command launches the CLI with `--model <resolved-model>`; the flag is omitted for the configured default.

Optional environment configuration:

```text
AGENTIC_MANAGED_DEFAULT_PROVIDER=codex
AGENTIC_MANAGED_CODEX_DEFAULT_MODEL=
AGENTIC_MANAGED_CODEX_ECONOMY_MODEL=
AGENTIC_MANAGED_CODEX_STANDARD_MODEL=
AGENTIC_MANAGED_CODEX_PREMIUM_MODEL=
AGENTIC_MANAGED_LOCAL_URL=http://127.0.0.1:11434
AGENTIC_MANAGED_LOCAL_MODEL=qwen2.5-coder:7b
```

Equivalent `CLAUDE` and `OPENCODE` default/tier model variables are supported. See `docs/specs/managed-runs/` for lifecycle, safety, routing, and acceptance requirements.

## Run

```bash
npm install
npm start
```

To prefill the app with a startup directory, pass it as an argument:

```bash
npm start -- /absolute/path/to/project
```

## Claude examples

Start a normal interactive session:

```bash
claude
```

Resume the latest session:

```bash
claude --continue
```

Start interactively and send the first prompt immediately:

```bash
claude -i "Audit this repo and suggest the smallest fix"
```

## Notes

- The wrapped command runs as if you started it in that directory in a terminal.
- On Linux, Electron needs a display server. In headless environments you will need something like Xvfb to launch the desktop window.
- Session tabs remain visible after exit so you can inspect terminal output and exit status.
- Session metadata is stored in Electron's per-user application-data directory.
- Terminal history is encrypted with Electron's OS-backed safe storage before it is written to disk. On Linux, this requires a supported desktop keyring; Electron's `basic_text` fallback is treated as unprotected. If protected storage is unavailable, terminal output is not persisted.
- Removing a stopped session also removes its stored history.
- Use the sidebar tools to copy diagnostics, open the local data folder, or clear all stopped-session history.
- See `PRIVACY.md`, `THIRD_PARTY_NOTICES.md`, and `docs/release-checklist.md` before distributing a release.

## Quality checks

```bash
npm run check
npm test -- --runInBand
npm run test:e2e
```

The Electron end-to-end suite covers session launch and terminal I/O, manual terminals, quick-open, modified files, themes, restart and restore behavior, and command failure handling.

## Architecture Docs

- See `docs/architecture.md` for runtime boundaries, IPC registrar ownership, preload contract sync flow, and extension guidance.
