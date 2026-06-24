const SUCCESS_LABELS = new Set([
  "Copied",
  "History cleared",
  "Opened",
  "Removed",
  "Renamed",
  "Saved",
]);
const WARNING_LABELS = new Set([
  "Find",
  "Find File",
  "Unsupported platform",
]);

export function getToastKind(label) {
  if (label === "Error") {
    return "error";
  }
  if (WARNING_LABELS.has(label)) {
    return "warning";
  }
  if (SUCCESS_LABELS.has(label)) {
    return "success";
  }
  return null;
}

export function createToastNotifier({ container, timers = window }) {
  const activeTimers = new Map();
  const durationByKind = {
    success: 3500,
    warning: 6000,
    error: 9000,
  };

  function dismiss(toast) {
    if (!toast) {
      return;
    }

    const timerId = activeTimers.get(toast);
    if (timerId) {
      timers.clearTimeout(timerId);
      activeTimers.delete(toast);
    }
    toast.remove();
  }

  function notify(label, message) {
    const kind = getToastKind(label);
    if (!kind || !container) {
      return null;
    }

    const toast = document.createElement("article");
    toast.className = `toast toast-${kind}`;
    toast.setAttribute("role", kind === "error" ? "alert" : "status");

    const content = document.createElement("div");
    content.className = "toast-content";

    const title = document.createElement("p");
    title.className = "toast-title";
    title.textContent = label;

    const detail = document.createElement("p");
    detail.className = "toast-message";
    detail.textContent = message || "";

    const dismissButton = document.createElement("button");
    dismissButton.type = "button";
    dismissButton.className = "toast-dismiss";
    dismissButton.setAttribute("aria-label", `Dismiss ${label} notification`);
    dismissButton.textContent = "×";
    dismissButton.addEventListener("click", () => dismiss(toast));

    content.append(title, detail);
    toast.append(content, dismissButton);
    container.append(toast);

    while (container.children.length > 4) {
      dismiss(container.firstElementChild);
    }

    const timerId = timers.setTimeout(
      () => dismiss(toast),
      durationByKind[kind],
    );
    activeTimers.set(toast, timerId);
    return toast;
  }

  return { dismiss, notify };
}
