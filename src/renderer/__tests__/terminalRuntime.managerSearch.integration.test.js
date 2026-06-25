function createMockElements() {
  const agentSearchBar = document.createElement("div");
  agentSearchBar.classList.add("hidden");

  const terminalContextMenu = document.createElement("div");
  terminalContextMenu.classList.add("hidden");

  return {
    agentSearchBar,
    agentSearchInput: document.createElement("input"),
    agentSearchCount: document.createElement("div"),
    agentSearchPrevButton: document.createElement("button"),
    agentSearchNextButton: document.createElement("button"),
    agentSearchCloseButton: document.createElement("button"),
    terminalContextMenu,
    terminalContextCopyButton: document.createElement("button"),
    terminalContextPasteButton: document.createElement("button"),
    terminalContextClearButton: document.createElement("button"),
    terminalContainer: document.createElement("div"),
    manualTerminalContainer1: document.createElement("div"),
    manualTerminalContainer2: document.createElement("div"),
    manualTerminalSubtitle1: document.createElement("div"),
    manualTerminalSubtitle2: document.createElement("div"),
  };
}

let mockElements = createMockElements();
let mockUiState = {
  activeSessionId: null,
  isAgentSearchOpen: false,
  terminalContextTarget: null,
};
let mockSessionTerminals = new Map();
let mockManualTerminals = new Map();
let mockSessionBuffers = new Map();
let mockManualTerminalBuffers = new Map();
let lastSearchResultsCallback = null;
let mockTerminalLine = null;

jest.mock("../dom.js", () => ({
  get elements() {
    return mockElements;
  },
}));

jest.mock("../state.js", () => ({
  get sessionTerminals() {
    return mockSessionTerminals;
  },
  get manualTerminals() {
    return mockManualTerminals;
  },
  get sessionBuffers() {
    return mockSessionBuffers;
  },
  get manualTerminalBuffers() {
    return mockManualTerminalBuffers;
  },
  get uiState() {
    return mockUiState;
  },
}));

jest.mock("../agenticApp.js", () => ({
  agenticApp: {
    openExternalUrl: jest.fn(() => Promise.resolve()),
    writeToSession: jest.fn(() => Promise.resolve()),
    resizeSession: jest.fn(() => Promise.resolve()),
    ensureManualTerminal: jest.fn(() => Promise.resolve({ outputBuffer: "" })),
    writeToManualTerminal: jest.fn(() => Promise.resolve()),
    resizeManualTerminal: jest.fn(() => Promise.resolve()),
    writeClipboardText: jest.fn(),
    readClipboardText: jest.fn(() => Promise.resolve("clipboard")),
  },
}));

jest.mock("../vendor/@xterm/xterm/lib/xterm.mjs", () => ({
  Terminal: jest.fn(() => ({
    loadAddon: jest.fn(),
    open: jest.fn(),
    registerLinkProvider: jest.fn(),
    onData: jest.fn(),
    onSelectionChange: jest.fn(),
    attachCustomKeyEventHandler: jest.fn(),
    hasSelection: jest.fn(() => false),
    getSelection: jest.fn(() => ""),
    paste: jest.fn(),
    write: jest.fn(),
    focus: jest.fn(),
    cols: 80,
    rows: 24,
    buffer: {
      active: {
        getLine: jest.fn(() => mockTerminalLine),
      },
    },
  })),
}));

jest.mock("../vendor/@xterm/addon-fit/lib/addon-fit.mjs", () => ({
  FitAddon: jest.fn(() => ({ fit: jest.fn() })),
}));

jest.mock("../vendor/@xterm/addon-search/lib/addon-search.mjs", () => ({
  SearchAddon: jest.fn(() => ({
    findNext: jest.fn(() => true),
    findPrevious: jest.fn(() => true),
    clearDecorations: jest.fn(),
    onDidChangeResults: jest.fn((listener) => {
      lastSearchResultsCallback = listener;
    }),
  })),
}));

jest.mock("../vendor/@xterm/addon-web-links/lib/addon-web-links.mjs", () => ({
  WebLinksAddon: jest.fn(() => ({})),
}));

import { SearchAddon } from "../vendor/@xterm/addon-search/lib/addon-search.mjs";
import { Terminal } from "../vendor/@xterm/xterm/lib/xterm.mjs";
import { agenticApp } from "../agenticApp.js";
import { createTerminalManager } from "../terminalRuntime.js";

async function flushAsyncHandlers() {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("terminalRuntime manager search integration", () => {
  beforeEach(() => {
    mockElements = createMockElements();
    mockUiState = {
      activeSessionId: null,
      isAgentSearchOpen: false,
      terminalContextTarget: null,
    };
    mockSessionTerminals = new Map();
    mockManualTerminals = new Map();
    mockSessionBuffers = new Map();
    mockManualTerminalBuffers = new Map();
    lastSearchResultsCallback = null;
    mockTerminalLine = null;
    jest.clearAllMocks();
  });

  test("binds search UI and updates count via search callback", () => {
    const setStatus = jest.fn();
    const manager = createTerminalManager({
      markSessionInput: jest.fn(),
      openReferencedFile: jest.fn(),
      scheduleUiRefresh: jest.fn(),
      setStatus,
    });

    mockUiState.activeSessionId = "session-1";
    manager.createSessionTerminal("session-1");

    manager.openAgentSearch();
    expect(mockElements.agentSearchBar.classList.contains("hidden")).toBe(
      false,
    );

    mockElements.agentSearchInput.value = "needle";
    mockElements.agentSearchInput.dispatchEvent(new Event("input"));

    const createdSearchAddon = SearchAddon.mock.results[0].value;
    expect(createdSearchAddon.findNext).toHaveBeenCalledWith(
      "needle",
      expect.any(Object),
    );
    const [, searchOptions] = createdSearchAddon.findNext.mock.calls[0];
    expect(searchOptions).toEqual(
      expect.objectContaining({
        incremental: true,
      }),
    );

    expect(typeof lastSearchResultsCallback).toBe("function");
    lastSearchResultsCallback({ resultIndex: 1, resultCount: 3 });
    expect(mockElements.agentSearchCount.textContent).toBe("2 of 3");

    mockElements.agentSearchInput.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    expect(mockElements.agentSearchBar.classList.contains("hidden")).toBe(true);

    expect(setStatus).not.toHaveBeenCalledWith(
      "Find",
      "Open a session before searching",
    );
  });

  test("Ctrl+P in terminal triggers workspace quick-open callback", () => {
    const openWorkspaceSearch = jest.fn();
    const manager = createTerminalManager({
      markSessionInput: jest.fn(),
      openReferencedFile: jest.fn(),
      openWorkspaceSearch,
      scheduleUiRefresh: jest.fn(),
      setStatus: jest.fn(),
    });

    mockUiState.activeSessionId = "session-1";
    const instance = manager.createSessionTerminal("session-1");
    const keyHandler =
      instance.terminal.attachCustomKeyEventHandler.mock.calls[0][0];

    const preventDefault = jest.fn();
    const handled = keyHandler({
      type: "keydown",
      ctrlKey: true,
      metaKey: false,
      altKey: false,
      key: "p",
      preventDefault,
    });

    expect(handled).toBe(false);
    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(openWorkspaceSearch).toHaveBeenCalledTimes(1);
  });

  test("Ctrl+C copies terminal selection before falling back to interrupt", async () => {
    const setStatus = jest.fn();
    const markSessionInput = jest.fn();
    const scheduleUiRefresh = jest.fn();
    const manager = createTerminalManager({
      markSessionInput,
      openReferencedFile: jest.fn(),
      scheduleUiRefresh,
      setStatus,
    });

    mockUiState.activeSessionId = "session-1";
    const instance = manager.createSessionTerminal("session-1");
    const keyHandler =
      instance.terminal.attachCustomKeyEventHandler.mock.calls[0][0];
    const preventDefault = jest.fn();

    instance.terminal.getSelection.mockReturnValue("selected text");
    expect(
      keyHandler({
        type: "keydown",
        ctrlKey: true,
        metaKey: false,
        altKey: false,
        key: "c",
        preventDefault,
      }),
    ).toBe(false);
    await flushAsyncHandlers();

    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(agenticApp.writeClipboardText).toHaveBeenCalledWith("selected text");
    expect(setStatus).toHaveBeenCalledWith("Copied", "Terminal selection");
    expect(agenticApp.writeToSession).not.toHaveBeenCalledWith(
      "session-1",
      "\u0003",
    );

    jest.clearAllMocks();
    instance.terminal.getSelection.mockReturnValue("");
    instance.selectionSnapshot = "";
    expect(
      keyHandler({
        type: "keydown",
        ctrlKey: true,
        metaKey: false,
        altKey: false,
        key: "c",
        preventDefault,
      }),
    ).toBe(false);
    await flushAsyncHandlers();

    expect(markSessionInput).toHaveBeenCalledWith("session-1");
    expect(scheduleUiRefresh).toHaveBeenCalledTimes(1);
    expect(agenticApp.writeToSession).toHaveBeenCalledWith(
      "session-1",
      "\u0003",
    );
  });

  test("right-click Copy uses preserved selection snapshot when live selection clears", async () => {
    const manager = createTerminalManager({
      markSessionInput: jest.fn(),
      openReferencedFile: jest.fn(),
      scheduleUiRefresh: jest.fn(),
      setStatus: jest.fn(),
    });

    mockUiState.activeSessionId = "session-1";
    const instance = manager.createSessionTerminal("session-1");
    const selectionListener =
      instance.terminal.onSelectionChange.mock.calls[0][0];

    instance.terminal.getSelection
      .mockReturnValueOnce("right-click selected text")
      .mockReturnValue("");
    selectionListener();

    instance.mount.dispatchEvent(
      new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        clientX: 20,
        clientY: 20,
      }),
    );
    expect(mockElements.terminalContextCopyButton.disabled).toBe(false);

    mockElements.terminalContextCopyButton.click();
    await flushAsyncHandlers();

    expect(agenticApp.writeClipboardText).toHaveBeenCalledWith(
      "right-click selected text",
    );
    expect(mockElements.terminalContextMenu.classList.contains("hidden")).toBe(
      true,
    );
  });

  test("registers file link providers on both manual terminals", async () => {
    const manager = createTerminalManager({
      markSessionInput: jest.fn(),
      openReferencedFile: jest.fn(),
      scheduleUiRefresh: jest.fn(),
      setStatus: jest.fn(),
    });

    mockUiState.activeSessionId = "session-1";
    await manager.showManualTerminal("session-1", "1");
    await manager.showManualTerminal("session-1", "2");

    const firstManualTerminal = Terminal.mock.results[0].value;
    const secondManualTerminal = Terminal.mock.results[1].value;
    expect(firstManualTerminal.registerLinkProvider).toHaveBeenCalledTimes(1);
    expect(secondManualTerminal.registerLinkProvider).toHaveBeenCalledTimes(1);
  });

  test.each([
    ["C:\\repo\\src\\main.js:12", "C:\\repo\\src\\main.js"],
    ["C:/repo/src/main.js:12", "C:/repo/src/main.js"],
    [
      "C:\\Users\\Jane Doe\\repo\\src\\main.js:12:4",
      "C:\\Users\\Jane Doe\\repo\\src\\main.js",
    ],
    [
      "C:\\Users\\Jane Doe\\repo\\src\\main.js(12,4)",
      "C:\\Users\\Jane Doe\\repo\\src\\main.js",
    ],
  ])("opens Windows terminal file links: %s", (terminalText, expectedPath) => {
    const openReferencedFile = jest.fn();
    const manager = createTerminalManager({
      markSessionInput: jest.fn(),
      openReferencedFile,
      scheduleUiRefresh: jest.fn(),
      setStatus: jest.fn(),
    });

    mockTerminalLine = {
      translateToString: jest.fn(() => terminalText),
    };
    const instance = manager.createSessionTerminal("session-1");
    const provider =
      instance.terminal.registerLinkProvider.mock.calls[0][0];
    const callback = jest.fn();

    provider.provideLinks(1, callback);

    const [links] = callback.mock.calls[0];
    expect(links).toHaveLength(1);
    links[0].activate();
    expect(openReferencedFile).toHaveBeenCalledWith(
      "session-1",
      expectedPath,
      12,
    );
  });
});
