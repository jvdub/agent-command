import { activateTerminalLink } from "../terminalLinks.mjs";

describe("terminal links", () => {
  test("opens a file-backed hyperlink in the workspace editor", async () => {
    const openExternalUrl = jest.fn();
    const openWorkspaceFile = jest.fn();
    const resolveWorkspaceFile = jest.fn(() => ({
      relativePath: "src/renderer/app.js",
    }));

    await activateTerminalLink("src/renderer/app.js#L2468", {
      openExternalUrl,
      openWorkspaceFile,
      resolveWorkspaceFile,
    });

    expect(resolveWorkspaceFile).toHaveBeenCalledWith("src/renderer/app.js");
    expect(openWorkspaceFile).toHaveBeenCalledWith(
      "src/renderer/app.js",
      2468,
    );
    expect(openExternalUrl).not.toHaveBeenCalled();
  });

  test("opens file URIs in the workspace editor", async () => {
    const openWorkspaceFile = jest.fn();
    const resolveWorkspaceFile = jest.fn(() => ({
      relativePath: "src/renderer/app.js",
    }));

    await activateTerminalLink(
      "file:///home/me/project/src/renderer/app.js#L10",
      {
        openExternalUrl: jest.fn(),
        openWorkspaceFile,
        resolveWorkspaceFile,
      },
    );

    expect(resolveWorkspaceFile).toHaveBeenCalledWith(
      "/home/me/project/src/renderer/app.js",
    );
    expect(openWorkspaceFile).toHaveBeenCalledWith(
      "src/renderer/app.js",
      10,
    );
  });

  test("keeps web links on the external URL path", async () => {
    const openExternalUrl = jest.fn();
    const openWorkspaceFile = jest.fn();

    await activateTerminalLink("https://example.com/docs", {
      openExternalUrl,
      openWorkspaceFile,
      resolveWorkspaceFile: jest.fn(),
    });

    expect(openExternalUrl).toHaveBeenCalledWith("https://example.com/docs");
    expect(openWorkspaceFile).not.toHaveBeenCalled();
  });
});
