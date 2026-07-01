import { attentionItems } from "./managedRunSelectors.js";

function escapeHtml(value) {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function allAttentionItems(runs) {
  return Array.from(runs || []).flatMap(attentionItems);
}

function renderInbox(runs, activeRunId) {
  const items = allAttentionItems(runs);
  if (!items.length) return '<p class="managed-inbox-empty">Nothing needs your attention.</p>';
  return items.map((item) => `
    <button type="button" class="managed-inbox-item priority-${escapeHtml(item.priority)} ${item.runId === activeRunId ? "active" : ""}" data-inbox-run-id="${escapeHtml(item.runId)}" data-inbox-task-id="${escapeHtml(item.taskId || "")}" data-inbox-attempt="${escapeHtml(item.attemptNumber || "")}" data-inbox-section="${escapeHtml(item.section || "overview")}">
      <span class="managed-inbox-dot" aria-hidden="true"></span>
      <span>${escapeHtml(item.label)}</span>
    </button>`).join("");
}

export { allAttentionItems, renderInbox };
