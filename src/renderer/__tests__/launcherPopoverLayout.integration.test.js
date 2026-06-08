import fs from "fs";

describe("launcher popover layout", () => {
  beforeEach(() => {
    document.head.innerHTML = "";
    document.body.innerHTML = "";
  });

  test("keeps the launcher in sidebar flow so it cannot cover session buttons", () => {
    const html = fs.readFileSync("src/renderer/index.html", "utf8");
    const css = fs.readFileSync("src/renderer/styles.css", "utf8");
    document.documentElement.innerHTML = html;
    const style = document.createElement("style");
    style.textContent = css;
    document.head.appendChild(style);

    const sidebar = document.querySelector(".tab-sidebar");
    const popover = document.querySelector("#new-session-popover");
    const sessionTabs = document.querySelector("#session-tabs-list");

    expect(sidebar).toBeTruthy();
    expect(popover).toBeTruthy();
    expect(sessionTabs).toBeTruthy();
    expect(Array.from(sidebar.children)).toEqual(
      expect.arrayContaining([popover, sessionTabs]),
    );

    expect(window.getComputedStyle(popover).position).not.toBe("absolute");
    expect(window.getComputedStyle(popover).zIndex).not.toBe("20");
  });
});
