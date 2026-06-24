const IPC_CHANNELS = Object.freeze({
  invoke: Object.freeze({
    getContext: "app:getContext",
    checkCommand: "app:check-command",
    getDiagnostics: "app:get-diagnostics",
    openDataFolder: "app:open-data-folder",
    pickDirectory: "dialog:pickDirectory",
    startSession: "session:start",
    listSessions: "sessions:list",
    stopSession: "session:stop",
    restartSession: "session:restart",
    renameSession: "session:rename",
    removeSession: "session:remove",
    clearSessionHistory: "sessions:clear-history",
    openWorkspaceFile: "editor:openFile",
    saveWorkspaceFile: "editor:saveFile",
    listWorkspaceFiles: "workspace:listFiles",
    listWorkspaceChanges: "workspace:listChanges",
    writeToSession: "session:write",
    resizeSession: "session:resize",
    getSessionProcesses: "session:processes",
    ensureManualTerminal: "manual-terminal:ensure",
    writeToManualTerminal: "manual-terminal:write",
    resizeManualTerminal: "manual-terminal:resize",
    openExternalUrl: "external-link:open",
    readClipboardText: "clipboard:read-text",
    writeClipboardText: "clipboard:write-text",
  }),
  events: Object.freeze({
    sessionsChanged: "sessions:changed",
    sessionData: "session:data",
    sessionExit: "session:exit",
    manualTerminalData: "manual-terminal:data",
    manualTerminalExit: "manual-terminal:exit",
    workspaceFileChanged: "workspace:file-changed",
    shortcutQuickOpen: "app:shortcut:quick-open",
    shortcutCopyOrInterrupt: "app:shortcut:copy-or-interrupt",
  }),
});

/**
 * @typedef {object} AppContext
 * @property {string} cwd
 * @property {string} homeDirectory
 * @property {string} shell
 * @property {NodeJS.Platform} platform
 * @property {boolean} processInspectionSupported
 * @property {string} appName
 * @property {string} appVersion
 * @property {boolean} supportedPlatform
 * @property {string} defaultCommand
 * @property {boolean} defaultCommandAvailable
 */

/**
 * @typedef {object} SessionSummary
 * @property {string} id
 * @property {string} label
 * @property {string} cwd
 * @property {string} command
 * @property {string[]} args
 * @property {string} outputBuffer
 * @property {boolean} isRunning
 * @property {number} createdAt
 * @property {number | null} endedAt
 * @property {number | null} exitCode
 * @property {number | string | null} signal
 * @property {boolean} stoppedByUser
 */

/**
 * @typedef {object} StartSessionOptions
 * @property {string} [label]
 * @property {string} command
 * @property {string} [args]
 * @property {string[]} [argsArray]
 * @property {string} [cwd]
 * @property {number} [cols]
 * @property {number} [rows]
 * @property {string} [sessionId]
 * @property {number} [createdAt]
 */

/**
 * @typedef {object} StartSessionResponse
 * @property {SessionSummary} session
 * @property {string} shell
 * @property {string} homeDirectory
 */

/**
 * @typedef {object} OkResponse
 * @property {boolean} ok
 */

/**
 * @typedef {object} StopSessionResponse
 * @property {boolean} stopped
 */

/**
 * @typedef {object} RemoveSessionResponse
 * @property {boolean} removed
 */

/**
 * @typedef {object} SessionsListResponse
 * @property {SessionSummary[]} sessions
 */

/**
 * @typedef {object} SessionWriteRequest
 * @property {string} sessionId
 * @property {string} input
 */

/**
 * @typedef {object} SessionResizeRequest
 * @property {string} sessionId
 * @property {number} cols
 * @property {number} rows
 */

/**
 * @typedef {object} OpenWorkspaceFileRequest
 * @property {string} sessionId
 * @property {string} filePath
 */

/**
 * @typedef {object} SaveWorkspaceFileRequest
 * @property {string} sessionId
 * @property {string} filePath
 * @property {string} content
 */

/**
 * @typedef {object} WorkspaceFileChangedEvent
 * @property {string} sessionId
 * @property {string} absolutePath
 * @property {string} relativePath
 * @property {string} [content]
 * @property {boolean} [deleted]
 */

/**
 * @typedef {object} WorkspaceListFilesRequest
 * @property {string} sessionId
 * @property {string} [root]
 */

/**
 * @typedef {object} SessionProcessesResponse
 * @property {unknown[]} processes
 * @property {boolean} supported
 */

/**
 * @typedef {object} ManualTerminalEnsureRequest
 * @property {string} sessionId
 * @property {string} terminalId
 */

/**
 * @typedef {object} ManualTerminalWriteRequest
 * @property {string} sessionId
 * @property {string} input
 * @property {string} terminalId
 */

/**
 * @typedef {object} ManualTerminalResizeRequest
 * @property {string} sessionId
 * @property {string} terminalId
 * @property {number} cols
 * @property {number} rows
 */

/**
 * @typedef {object} ManualTerminalState
 * @property {string} cwd
 * @property {string} shell
 * @property {string} terminalId
 * @property {boolean} isRunning
 * @property {string} outputBuffer
 */

/**
 * @typedef {object} SessionDataEvent
 * @property {string} sessionId
 * @property {string} data
 */

/**
 * @typedef {object} SessionExitEvent
 * @property {string} sessionId
 * @property {number} exitCode
 * @property {number | string | null} signal
 */

/**
 * @typedef {object} ManualTerminalDataEvent
 * @property {string} sessionId
 * @property {string} terminalId
 * @property {string} data
 */

/**
 * @typedef {object} ManualTerminalExitEvent
 * @property {string} sessionId
 * @property {string} terminalId
 * @property {number} exitCode
 * @property {number | string | null} signal
 */

/**
 * @typedef {null} ShortcutEvent
 */

/**
 * @typedef {object} AgenticAppApi
 * @property {() => Promise<AppContext>} getContext
 * @property {(command: string) => Promise<{available: boolean, command: string}>} checkCommand
 * @property {() => Promise<string>} getDiagnostics
 * @property {() => Promise<OkResponse>} openDataFolder
 * @property {() => Promise<string | null>} pickDirectory
 * @property {(options: StartSessionOptions) => Promise<StartSessionResponse>} startSession
 * @property {() => Promise<SessionsListResponse>} listSessions
 * @property {(sessionId: string) => Promise<StopSessionResponse>} stopSession
 * @property {(sessionId: string) => Promise<StartSessionResponse>} restartSession
 * @property {(sessionId: string, label: string) => Promise<SessionSummary>} renameSession
 * @property {(sessionId: string) => Promise<RemoveSessionResponse>} removeSession
 * @property {() => Promise<{removed: number}>} clearSessionHistory
 * @property {(sessionId: string, filePath: string) => Promise<unknown>} openWorkspaceFile
 * @property {(sessionId: string, filePath: string, content: string) => Promise<unknown>} saveWorkspaceFile
 * @property {(payload: WorkspaceListFilesRequest) => Promise<unknown>} listWorkspaceFiles
 * @property {(sessionId: string) => Promise<unknown>} listWorkspaceChanges
 * @property {(sessionId: string, input: string) => Promise<OkResponse>} writeToSession
 * @property {(sessionId: string, size: { cols: number, rows: number }) => Promise<OkResponse>} resizeSession
 * @property {(sessionId: string) => Promise<SessionProcessesResponse>} getSessionProcesses
 * @property {(sessionId: string, terminalId?: string) => Promise<ManualTerminalState>} ensureManualTerminal
 * @property {(sessionId: string, input: string, terminalId?: string) => Promise<OkResponse>} writeToManualTerminal
 * @property {(sessionId: string, size: { cols: number, rows: number }, terminalId?: string) => Promise<OkResponse>} resizeManualTerminal
 * @property {(url: string) => Promise<OkResponse>} openExternalUrl
 * @property {() => Promise<string>} readClipboardText
 * @property {(value: string) => Promise<void>} writeClipboardText
 * @property {(listener: (payload: SessionSummary[]) => void) => () => void} onSessionsChanged
 * @property {(listener: (payload: SessionDataEvent) => void) => () => void} onSessionData
 * @property {(listener: (payload: SessionExitEvent) => void) => () => void} onSessionExit
 * @property {(listener: (payload: ManualTerminalDataEvent) => void) => () => void} onManualTerminalData
 * @property {(listener: (payload: ManualTerminalExitEvent) => void) => () => void} onManualTerminalExit
 * @property {(listener: (payload: WorkspaceFileChangedEvent) => void) => () => void} onWorkspaceFileChanged
 * @property {(listener: (payload: ShortcutEvent) => void) => () => void} onQuickOpenShortcut
 * @property {(listener: (payload: ShortcutEvent) => void) => () => void} onCopyOrInterruptShortcut
 */

function buildOpenWorkspaceFileRequest(sessionId, filePath) {
  return { sessionId, filePath };
}

function buildSaveWorkspaceFileRequest(sessionId, filePath, content) {
  return { sessionId, filePath, content };
}

function buildSessionWriteRequest(sessionId, input) {
  return { sessionId, input };
}

function buildSessionResizeRequest(sessionId, size) {
  return {
    sessionId,
    cols: size.cols,
    rows: size.rows,
  };
}

function buildManualTerminalEnsureRequest(sessionId, terminalId = "1") {
  return {
    sessionId,
    terminalId: String(terminalId || "1"),
  };
}

function buildManualTerminalWriteRequest(sessionId, input, terminalId = "1") {
  return {
    sessionId,
    input,
    terminalId: String(terminalId || "1"),
  };
}

function buildManualTerminalResizeRequest(sessionId, size, terminalId = "1") {
  return {
    sessionId,
    terminalId: String(terminalId || "1"),
    cols: size.cols,
    rows: size.rows,
  };
}

function buildExternalLinkRequest(url) {
  return { url };
}

function buildManualTerminalState(terminal) {
  return {
    cwd: terminal.cwd,
    shell: terminal.shell,
    terminalId: terminal.terminalId,
    isRunning: terminal.isRunning,
    outputBuffer: terminal.outputBuffer,
  };
}

function buildOkResponse(ok) {
  return { ok: Boolean(ok) };
}

function buildRemoveSessionResponse(removed) {
  return { removed: Boolean(removed) };
}

function buildSessionLaunchResponse(session, shell, homeDirectory) {
  return {
    session,
    shell,
    homeDirectory,
  };
}

function buildSessionsListResponse(sessions) {
  return { sessions };
}

function buildStopSessionResponse(stopped) {
  return { stopped: Boolean(stopped) };
}

function buildSessionDataEvent(sessionId, data) {
  return { sessionId, data };
}

function buildSessionExitEvent(sessionId, exitCode, signal, stoppedByUser = false) {
  return {
    sessionId,
    exitCode,
    signal: signal || null,
    stoppedByUser: Boolean(stoppedByUser),
  };
}

function buildManualTerminalDataEvent(sessionId, terminalId, data) {
  return {
    sessionId,
    terminalId,
    data,
  };
}

function buildManualTerminalExitEvent(sessionId, terminalId, exitCode, signal) {
  return {
    sessionId,
    terminalId,
    exitCode,
    signal: signal || null,
  };
}

function normalizeSessionProcessesResponse(result) {
  if (Array.isArray(result)) {
    return { processes: result, supported: true };
  }

  return {
    processes: Array.isArray(result?.processes) ? result.processes : [],
    supported: result?.supported !== false,
  };
}

module.exports = {
  IPC_CHANNELS,
  buildExternalLinkRequest,
  buildManualTerminalDataEvent,
  buildManualTerminalEnsureRequest,
  buildManualTerminalExitEvent,
  buildManualTerminalResizeRequest,
  buildManualTerminalState,
  buildManualTerminalWriteRequest,
  buildOkResponse,
  buildOpenWorkspaceFileRequest,
  buildRemoveSessionResponse,
  buildSaveWorkspaceFileRequest,
  buildSessionDataEvent,
  buildSessionExitEvent,
  buildSessionLaunchResponse,
  buildSessionResizeRequest,
  buildSessionsListResponse,
  buildStopSessionResponse,
  buildSessionWriteRequest,
  normalizeSessionProcessesResponse,
};
