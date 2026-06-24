import {
  createToastNotifier,
  getToastKind,
} from "../toastNotifications";

describe("toast notifications", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    document.body.innerHTML = '<div id="toasts"></div>';
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test("suppresses routine session lifecycle status", () => {
    const notifier = createToastNotifier({
      container: document.querySelector("#toasts"),
    });

    expect(getToastKind("Running")).toBeNull();
    expect(notifier.notify("Running", "Session started")).toBeNull();
    expect(document.querySelector("#toasts").children).toHaveLength(0);
  });

  test("shows and automatically dismisses action feedback", () => {
    const notifier = createToastNotifier({
      container: document.querySelector("#toasts"),
    });

    notifier.notify("Copied", "Application diagnostics copied");

    expect(document.querySelector(".toast-success").textContent).toContain(
      "Application diagnostics copied",
    );
    jest.advanceTimersByTime(3500);
    expect(document.querySelector(".toast")).toBeNull();
  });

  test("renders errors as dismissible alerts", () => {
    const notifier = createToastNotifier({
      container: document.querySelector("#toasts"),
    });

    notifier.notify("Error", "Unable to launch command");
    const alert = document.querySelector('[role="alert"]');
    expect(alert.textContent).toContain("Unable to launch command");

    alert.querySelector("button").click();
    expect(document.querySelector(".toast")).toBeNull();
  });
});
