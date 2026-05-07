# Agentic Command

Desktop wrapper for interactive agent CLIs running inside a real pseudo-terminal.

## What it does

- Starts an agent command in a chosen working directory.
- Supports multiple concurrent sessions, each with its own PTY process.
- Preserves interactive terminal behavior through `node-pty`, including prompts, permission requests, and follow-up questions.
- Keeps a persistent left sidebar for launching new sessions and viewing launcher status.
- Uses the main workspace area as a command center to show session cards.
- Opens a per-session raw terminal in the main workspace when you click a card, with an inline back arrow in the terminal header to return to command center cards.
- Surfaces per-session attention states in cards so you can quickly triage which agents need input.

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
  - Implements a persistent sidebar plus a main-area view switcher.
  - Stores session metadata and output buffers per `sessionId`.
  - Derives attention states from PTY output heuristics: permission prompts, question prompts, idle sessions, and errors.
  - Clicking a card switches the main area into terminal detail for that session.
  - Back arrow returns the main area to command-center cards without tearing down running sessions.

## Current target

This workspace does expose the Copilot CLI as `copilot`, and running it with no arguments starts the normal interactive session. The command field stays editable so you can swap in a different agent later, but the default target is now the real Copilot entrypoint.

## Run

```bash
npm install
npm start
```

To prefill the app with a startup directory, pass it as an argument:

```bash
npm start -- /absolute/path/to/project
```

## Copilot examples

Start a normal interactive session:

```bash
copilot
```

Resume the latest session:

```bash
copilot --continue
```

Start interactively and send the first prompt immediately:

```bash
copilot -i "Audit this repo and suggest the smallest fix"
```

## Notes

- The wrapped command runs as if you started it in that directory in a terminal.
- On Linux, Electron needs a display server. In headless environments you will need something like Xvfb to launch the desktop window.
- Session cards remain visible after exit so you can inspect terminal output and exit status.
