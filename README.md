# Agentic Command

Desktop wrapper for interactive agent CLIs running inside a real pseudo-terminal.

## What it does

- Starts an agent command in a chosen working directory.
- Supports multiple concurrent sessions, each with its own PTY process.
- Preserves interactive terminal behavior through `node-pty`, including prompts, permission requests, and follow-up questions.
- Keeps a persistent left sidebar for launching, switching, restarting, and removing sessions.
- Opens the selected agent terminal beside workspace changes and manual shell terminals.
- Supports quick-open workspace navigation, modified-file inspection, and in-app file editing.
- Surfaces per-session attention states so you can quickly triage which agents need input.
- Supports system, light, and dark appearance modes.

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
- Terminal history is encrypted with Electron's OS-backed safe storage before it is written to disk. If protected storage is unavailable, terminal output is not persisted.
- Removing a stopped session also removes its stored history.

## Quality checks

```bash
npm run check
npm test -- --runInBand
npm run test:e2e
```

The Electron end-to-end suite covers session launch and terminal I/O, manual terminals, quick-open, modified files, themes, restart and restore behavior, and command failure handling.

## Architecture Docs

- See `docs/architecture.md` for runtime boundaries, IPC registrar ownership, preload contract sync flow, and extension guidance.
