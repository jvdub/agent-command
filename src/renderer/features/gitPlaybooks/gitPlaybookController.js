import {
  GIT_PLAYBOOKS,
  getGitPlaybook,
  renderGitPlaybookPrompt,
} from "./gitPlaybooks.js";

const READY_MESSAGE =
  "Review the prompt and send it only when the agent is ready for input.";

function formatTerminalPaste(prompt) {
  const normalized = prompt.replace(/\r?\n/g, "\r");
  return `\u001b[200~${normalized}\u001b[201~\r`;
}

export function createGitPlaybookController({
  document,
  getSession,
  getTerminal,
  writeToSession,
  writeClipboardText,
  markSessionInput,
  scheduleUiRefresh,
}) {
  const button = document.querySelector("#ask-agent-button");
  const menu = document.querySelector("#ask-agent-menu");
  const overlay = document.querySelector("#git-playbook-overlay");
  const composer = overlay?.querySelector(".git-playbook-composer");
  const title = document.querySelector("#git-playbook-title");
  const prompt = document.querySelector("#git-playbook-prompt");
  const status = document.querySelector("#git-playbook-status");
  const closeButton = document.querySelector("#git-playbook-close");
  const copyButton = document.querySelector("#git-playbook-copy");
  const sendButton = document.querySelector("#git-playbook-send");

  if (
    !button ||
    !menu ||
    !overlay ||
    !composer ||
    !title ||
    !prompt ||
    !status ||
    !closeButton ||
    !copyButton ||
    !sendButton
  ) {
    return {
      setSession() {},
      prepareForSessionChange() {},
      clearSession() {},
    };
  }

  let composerSessionId = null;
  let activePlaybookId = null;
  let sending = false;

  menu.innerHTML = GIT_PLAYBOOKS.map(
    (playbook) =>
      `<button type="button" class="ask-agent-menu-item" role="menuitem" data-playbook-id="${playbook.id}">${playbook.label}</button>`,
  ).join("");

  function setMenuOpen(open) {
    menu.classList.toggle("hidden", !open);
    button.setAttribute("aria-expanded", String(open));
  }

  function resetComposer({ restoreFocus = true } = {}) {
    overlay.classList.add("hidden");
    prompt.value = "";
    status.textContent = READY_MESSAGE;
    composerSessionId = null;
    activePlaybookId = null;
    sending = false;
    sendButton.disabled = false;
    if (restoreFocus) {
      button.focus();
    }
  }

  function updateEligibility(session = getSession()) {
    const enabled = Boolean(session?.isRunning) && !sending;
    button.disabled = !enabled;
    sendButton.disabled = !enabled;
    if (!session?.isRunning && !overlay.classList.contains("hidden")) {
      status.textContent = "The agent session is not running. Close this prompt or restart the session.";
    }
  }

  function openComposer(playbookId) {
    const session = getSession();
    const playbook = getGitPlaybook(playbookId);
    if (!session?.isRunning || !playbook) {
      setMenuOpen(false);
      updateEligibility(session);
      return;
    }

    composerSessionId = session.id;
    activePlaybookId = playbookId;
    title.textContent = playbook.label;
    composer.setAttribute("aria-label", `${playbook.label} playbook`);
    prompt.value = renderGitPlaybookPrompt(playbookId, {
      workingDirectory: session.cwd,
    });
    status.textContent = READY_MESSAGE;
    overlay.classList.remove("hidden");
    setMenuOpen(false);
    updateEligibility(session);
    prompt.focus();
    prompt.setSelectionRange(prompt.value.length, prompt.value.length);
  }

  async function copyPrompt() {
    try {
      await writeClipboardText(prompt.value);
      status.textContent = "Prompt copied.";
    } catch (error) {
      status.textContent = error.message || "Unable to copy the prompt.";
    }
  }

  async function sendPrompt() {
    if (sending || !prompt.value.trim()) {
      if (!prompt.value.trim()) {
        status.textContent = "Enter a prompt before sending.";
      }
      return;
    }

    const session = getSession();
    if (
      !session?.isRunning ||
      session.id !== composerSessionId ||
      !activePlaybookId
    ) {
      updateEligibility(session);
      return;
    }

    sending = true;
    sendButton.disabled = true;
    status.textContent = "Sending prompt...";
    const editedPrompt = prompt.value;

    try {
      await writeToSession(session.id, formatTerminalPaste(editedPrompt));
      markSessionInput(session.id);
      resetComposer({ restoreFocus: false });
      getTerminal()?.terminal?.focus();
      scheduleUiRefresh();
    } catch (error) {
      sending = false;
      status.textContent = error.message || "Unable to send the prompt.";
      updateEligibility(getSession());
    }
  }

  button.addEventListener("click", () => {
    if (button.disabled) {
      return;
    }
    setMenuOpen(menu.classList.contains("hidden"));
  });

  menu.addEventListener("click", (event) => {
    const item = event.target.closest?.("[data-playbook-id]");
    if (item) {
      openComposer(item.dataset.playbookId);
    }
  });

  closeButton.addEventListener("click", resetComposer);
  copyButton.addEventListener("click", copyPrompt);
  sendButton.addEventListener("click", sendPrompt);
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay && !sending) {
      resetComposer();
    }
  });
  document.addEventListener("click", (event) => {
    if (!button.contains(event.target) && !menu.contains(event.target)) {
      setMenuOpen(false);
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !menu.classList.contains("hidden")) {
      event.preventDefault();
      setMenuOpen(false);
      button.focus();
      return;
    }

    if (overlay.classList.contains("hidden")) {
      return;
    }

    if (event.key === "Escape" && !sending) {
      event.preventDefault();
      resetComposer();
      return;
    }

    if (event.key === "Tab") {
      const focusable = Array.from(
        composer.querySelectorAll("button:not([disabled]), textarea:not([disabled])"),
      );
      const activeIndex = focusable.indexOf(document.activeElement);
      const movingBackward = event.shiftKey;
      if (
        (movingBackward && activeIndex <= 0) ||
        (!movingBackward && activeIndex === focusable.length - 1)
      ) {
        event.preventDefault();
        focusable[movingBackward ? focusable.length - 1 : 0]?.focus();
      }
    }
  });

  updateEligibility(null);

  return {
    setSession(session) {
      updateEligibility(session);
    },
    prepareForSessionChange(sessionId) {
      if (composerSessionId && composerSessionId !== sessionId) {
        resetComposer({ restoreFocus: false });
      }
      setMenuOpen(false);
    },
    clearSession() {
      resetComposer({ restoreFocus: false });
      setMenuOpen(false);
      updateEligibility(null);
    },
  };
}
