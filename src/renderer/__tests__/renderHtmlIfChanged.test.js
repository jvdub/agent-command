import { renderHtmlIfChanged } from "../renderHtmlIfChanged.js";

describe("renderHtmlIfChanged", () => {
  test("preserves mounted elements when requested markup has not changed", () => {
    const container = document.createElement("div");
    const html = '<button class="session-tab">Session</button>';

    expect(renderHtmlIfChanged(container, html)).toBe(true);
    const tab = container.querySelector(".session-tab");

    expect(renderHtmlIfChanged(container, html)).toBe(false);
    expect(container.querySelector(".session-tab")).toBe(tab);
  });

  test("replaces mounted elements when requested markup changes", () => {
    const container = document.createElement("div");

    renderHtmlIfChanged(
      container,
      '<button class="session-tab">First</button>',
    );
    const firstTab = container.querySelector(".session-tab");

    expect(
      renderHtmlIfChanged(
        container,
        '<button class="session-tab active">Second</button>',
      ),
    ).toBe(true);
    expect(container.querySelector(".session-tab")).not.toBe(firstTab);
  });
});
