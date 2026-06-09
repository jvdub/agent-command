import { createPopoverDismissalController } from "../popoverDismissal.js";

function setupController() {
  document.body.innerHTML = `
    <button id="launcher">+</button>
    <button id="empty-launcher">Open</button>
    <div id="popover">
      <input id="session-name" value="selected text" />
    </div>
    <button id="outside">Outside</button>
  `;

  const popover = document.querySelector("#popover");
  const launcher = document.querySelector("#launcher");
  const emptyLauncher = document.querySelector("#empty-launcher");
  const input = document.querySelector("#session-name");
  const outside = document.querySelector("#outside");
  const controller = createPopoverDismissalController({
    popover,
    ignoredElements: [launcher, emptyLauncher],
  });

  return {
    controller,
    emptyLauncher,
    input,
    launcher,
    outside,
    popover,
  };
}

function event(type, target) {
  const domEvent = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    view: window,
  });
  Object.defineProperty(domEvent, "target", {
    configurable: true,
    value: target,
  });
  return domEvent;
}

describe("popover dismissal", () => {
  test("dismisses when the pointer interaction starts and ends outside", () => {
    const { controller, outside } = setupController();

    controller.handlePointerDown(event("pointerdown", outside));

    expect(controller.shouldDismiss(event("click", outside))).toBe(true);
  });

  test("keeps the popover open when a drag starts inside and releases outside", () => {
    const { controller, input, outside } = setupController();

    controller.handlePointerDown(event("pointerdown", input));

    expect(controller.shouldDismiss(event("click", outside))).toBe(false);
  });

  test("does not dismiss clicks inside ignored launcher controls", () => {
    const { controller, launcher } = setupController();

    controller.handlePointerDown(event("pointerdown", launcher));

    expect(controller.shouldDismiss(event("click", launcher))).toBe(false);
  });

  test("does not dismiss when the popover is already hidden", () => {
    const { controller, outside, popover } = setupController();
    popover.classList.add("hidden");

    controller.handlePointerDown(event("pointerdown", outside));

    expect(controller.shouldDismiss(event("click", outside))).toBe(false);
  });
});
