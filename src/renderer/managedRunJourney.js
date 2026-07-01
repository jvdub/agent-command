import { journeyStations } from "./managedRunSelectors.js";

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderAttemptTrail(station) {
  if (!station.segments?.length) return '<span class="journey-attempt-empty">No attempts yet</span>';
  return station.segments.map((segment) => {
    if (segment.kind === "retry") {
      return `<span class="journey-retry" aria-label="Retry attempt ${segment.attemptNumber}">↺</span>`;
    }
    const label = segment.kind === "implementation" ? "Build" : "Verify";
    const state = segment.verdict || segment.state;
    return `<span class="journey-phase journey-phase-${escapeHtml(state)}">${label} ${segment.attemptNumber}</span>`;
  }).join('<span class="journey-phase-arrow" aria-hidden="true">→</span>');
}

function renderJourney(run, selectedTaskId) {
  return journeyStations(run).map((station, index) => {
    const dependencyText = station.dependencies?.length
      ? `Depends on ${station.dependencies.join(", ")}`
      : "No dependencies";
    const selected = station.id === selectedTaskId;
    return `
      <li class="journey-stop journey-stop-${escapeHtml(station.status)} ${selected ? "selected" : ""}">
        ${index ? '<span class="journey-connector" aria-hidden="true"></span>' : ""}
        <button type="button" class="journey-station" data-task-id="${escapeHtml(station.id)}" aria-pressed="${selected}" aria-label="${escapeHtml(`${station.title}, ${station.phase}, ${dependencyText}`)}">
          <span class="journey-station-marker" aria-hidden="true">${station.status === "succeeded" || station.status === "pass" ? "✓" : station.kind === "final-verification" ? "◆" : index + 1}</span>
          <span class="journey-station-copy">
            <span class="journey-station-title">${escapeHtml(station.title)}</span>
            <span class="journey-station-meta">${escapeHtml(station.phase)}${station.kind === "task" ? ` · ${station.attempts}/${station.maxAttempts || "–"} attempts` : ""}</span>
            <span class="journey-dependencies">${escapeHtml(dependencyText)}</span>
            <span class="journey-attempt-trail">${renderAttemptTrail(station)}</span>
          </span>
        </button>
      </li>`;
  }).join("");
}

export { renderJourney };
