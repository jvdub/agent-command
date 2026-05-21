import { createDefaultState } from "../../../state/index";
import { createManualTerminals } from "../manualTerminals";
import { createAgentTerminal } from "../agentTerminal";

const mockTerminal = {
  loadAddon: jest.fn(),
  open: jest.fn(),
  dispose: jest.fn(),
  write: jest.fn(),
  onData: jest.fn(),
  onResize: jest.fn(),
};

const mockFitAddon = {
  fit: jest.fn(),
  dispose: jest.fn(),
};

jest.mock("../../../vendor/@xterm/xterm/lib/xterm.mjs", () => ({
  Terminal: jest.fn(() => mockTerminal),
}));

jest.mock("../../../vendor/@xterm/addon-fit/lib/addon-fit.mjs", () => ({
  FitAddon: jest.fn(() => mockFitAddon),
}));

jest.mock(
  "../../../vendor/@xterm/addon-web-links/lib/addon-web-links.mjs",
  () => ({
    WebLinksAddon: jest.fn(() => ({ activate: jest.fn(), dispose: jest.fn() })),
  }),
);

describe("terminalView Module", () => {
  let stateManager;

  beforeEach(() => {
    jest.clearAllMocks();
    const defaultState = createDefaultState();
    stateManager = defaultState.stateManager;
    stateManager.setState("data.sessionBuffers", new Map());
  });

  describe("createManualTerminals", () => {
    it("should create a manual terminal and store it in stateManager", () => {
      const config = {
        stateManager,
        elements: {
          manualTerminalContainer1: document.createElement("div"),
          manualTerminalContainer2: document.createElement("div"),
        },
        createWebLinksAddon: jest.fn(() => ({
          activate: jest.fn(),
          dispose: jest.fn(),
        })),
      };

      const manualTerminals = createManualTerminals(config);
      const terminal = manualTerminals.createManualTerminal("session1", "1");

      expect(terminal).toBeDefined();
      const storedTerminals = stateManager.getState(
        "features.terminalView.manualTerminals",
      );
      expect(storedTerminals.has("session1:1")).toBe(true);
    });
  });

  describe("createAgentTerminal", () => {
    it("should append session buffer correctly", () => {
      const config = { stateManager };
      const agentTerminal = createAgentTerminal(config);

      agentTerminal.appendSessionBuffer("session1", "chunk1");
      agentTerminal.appendSessionBuffer("session1", "chunk2");

      const sessionBuffers = stateManager.getState("data.sessionBuffers");
      expect(sessionBuffers.get("session1")).toBe("chunk1chunk2");
    });
  });
});
