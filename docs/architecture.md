# Architecture Notes

This document explains the main runtime boundaries and where to add new behavior safely.

## Goals

- Keep Electron sandbox enabled.
- Keep IPC contracts centralized and synchronized.
- Keep main-process responsibilities modular.
- Keep large-workspace operations responsive.

## Runtime Layers

1. Main process (Node + Electron privileged APIs)
- Entry: src/main.js
- Owns app lifecycle, BrowserWindow creation, PTY process orchestration, and filesystem access.
- Delegates business logic to service modules under src/main/services.

2. IPC registration layer (transport wiring)
- Composer: src/main/ipc/registerIpcHandlers.js
- Domain registrars:
  - src/main/ipc/registerAppIpcHandlers.js
  - src/main/ipc/registerSessionIpcHandlers.js
  - src/main/ipc/registerWorkspaceIpcHandlers.js
  - src/main/ipc/registerManualTerminalIpcHandlers.js
- Keep these files focused on request validation, mapping to services, and response shaping.

3. Shared contract (single source of truth)
- src/shared/ipcContract.js
- Defines IPC channel names and shared request/response helpers.

4. Preload bridge (sandbox-safe renderer API)
- src/preload.js
- Exposes window.agentic with narrowed capabilities.
- Must not expose Node/Electron internals directly to renderer modules.

5. Renderer (UI state + presentation)
- Entry: src/renderer/app.js
- Feature modules: src/renderer/terminalRuntime.js, src/renderer/workspaceTools.js, etc.
- Talks only to the preload bridge API.

## IPC Channel Synchronization

Because sandboxed preload contexts cannot freely import local files at runtime, the IPC channel section in src/preload.js is generated at build/check time.

- Generator script: scripts/sync-preload-ipc-contract.mjs
- Source contract: src/shared/ipcContract.js
- Generated section in preload is delimited by:
  - // BEGIN AUTO-GENERATED IPC CHANNELS
  - // END AUTO-GENERATED IPC CHANNELS

Commands:
- Write/sync: npm run prepare:preload-ipc-contract
- Verify only: npm run check:preload-ipc-contract

The top-level check pipeline enforces this to prevent channel drift.

## Adding a New IPC Endpoint

1. Add channel name in src/shared/ipcContract.js under IPC_CHANNELS.
2. Add request/response helper builders in src/shared/ipcContract.js if needed.
3. Run npm run prepare:preload-ipc-contract to sync preload channel constants.
4. Add handler to the correct domain registrar in src/main/ipc.
5. Add or update main service logic in src/main/services.
6. Expose method through src/preload.js bridge section.
7. Call the bridge method from renderer helper src/renderer/agenticApp.js.
8. Run npm run check.

## Performance Guidance for Large Workspaces

- Prefer asynchronous filesystem calls in main-process services.
- Keep directory traversal bounded and skip heavy folders (node_modules, .git, dist, build).
- Avoid synchronous file operations inside IPC handlers.
- Keep payloads small and shaped for renderer needs.

## Security Notes

Current hardening in BrowserWindow should stay enabled:
- contextIsolation: true
- nodeIntegration: false
- sandbox: true
- webSecurity: true
- deny window.open and renderer-driven navigation/webview attachment

These controls are foundational for running untrusted command output in a desktop shell.
