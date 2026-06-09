const fs = require("fs");
const path = require("path");
const { test, expect } = require("@playwright/test");

test("open launcher does not intercept first click on session buttons", async ({
  page,
}) => {
  const rootDir = path.resolve(__dirname, "..");
  const rendererDir = path.join(rootDir, "src", "renderer");
  const html = fs
    .readFileSync(path.join(rendererDir, "index.html"), "utf8")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, "");
  const css = fs.readFileSync(path.join(rendererDir, "styles.css"), "utf8");

  await page.setContent(html, {
    waitUntil: "domcontentloaded",
  });
  await page.addStyleTag({ content: css });

  await page.evaluate(() => {
    const popover = document.querySelector("#new-session-popover");
    const sessionTabs = document.querySelector("#session-tabs-list");
    popover.classList.remove("hidden");
    sessionTabs.innerHTML = `
      <button type="button" class="session-tab" data-testid="target-session">
        <div class="session-tab-top">
          <p class="session-tab-name">Running session</p>
          <p class="session-tab-id">#abc123</p>
        </div>
        <p class="session-tab-attention">Running</p>
      </button>
    `;
    window.__sessionClickCount = 0;
    document
      .querySelector("[data-testid='target-session']")
      .addEventListener("click", () => {
        window.__sessionClickCount += 1;
      });
  });

  const target = page.getByTestId("target-session");
  await expect(target).toBeVisible();

  const box = await target.boundingBox();
  expect(box).toBeTruthy();

  const clickPoint = {
    x: box.x + box.width / 2,
    y: box.y + box.height / 2,
  };

  await expect(
    page.evaluate(({ x, y }) => {
      return document
        .elementFromPoint(x, y)
        ?.closest("[data-testid='target-session']")
        ?.getAttribute("data-testid");
    }, clickPoint),
  ).resolves.toBe("target-session");

  await page.mouse.click(clickPoint.x, clickPoint.y);
  await expect
    .poll(() => page.evaluate(() => window.__sessionClickCount))
    .toBe(1);
});
