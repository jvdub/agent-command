import { journeyStations } from "./managedRunSelectors.js";

const NODE_WIDTH = 220;
const NODE_HEIGHT = 160;
const COLUMN_GAP = 96;
const ROW_GAP = 34;
const GRAPH_PADDING = 34;

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
      return `<span class="journey-retry" aria-label="Retry attempt ${segment.attemptNumber}">&#8634;</span>`;
    }
    const labels = { implementation: "Build", "spec-verification": "Spec", "standards-verification": "Standards", "ticket-commit": "Commit" };
    const label = labels[segment.kind] || "Verify";
    const state = segment.verdict || segment.state;
    return `<span class="journey-phase journey-phase-${escapeHtml(state)}">${label} ${segment.attemptNumber}</span>`;
  }).join('<span class="journey-phase-arrow" aria-hidden="true">&#8594;</span>');
}

function layoutJourney(run, { direction = "horizontal" } = {}) {
  const stations = journeyStations(run);
  const byId = new Map(stations.map((station) => [station.id, station]));
  const levels = new Map();

  function levelFor(station, visiting = new Set()) {
    if (levels.has(station.id)) return levels.get(station.id);
    if (visiting.has(station.id)) return 0;
    visiting.add(station.id);
    const dependencies = (station.dependencies || []).filter((id) => byId.has(id));
    const level = dependencies.length
      ? Math.max(...dependencies.map((id) => levelFor(byId.get(id), visiting) + 1))
      : 0;
    visiting.delete(station.id);
    levels.set(station.id, level);
    return level;
  }

  const columns = new Map();
  for (const station of stations) {
    const level = levelFor(station);
    if (!columns.has(level)) columns.set(level, []);
    columns.get(level).push(station);
  }
  for (const column of columns.values()) {
    column.sort((a, b) => (a.order || Number.MAX_SAFE_INTEGER) - (b.order || Number.MAX_SAFE_INTEGER));
  }

  const maxLevel = Math.max(0, ...columns.keys());
  const maxRows = Math.max(1, ...[...columns.values()].map((column) => column.length));
  const horizontal = direction === "horizontal";
  const width = horizontal
    ? GRAPH_PADDING * 2 + ((maxLevel + 1) * NODE_WIDTH) + (maxLevel * COLUMN_GAP)
    : Math.max(430, GRAPH_PADDING * 2 + (maxRows * NODE_WIDTH) + ((maxRows - 1) * COLUMN_GAP));
  const height = horizontal
    ? Math.max(430, GRAPH_PADDING * 2 + (maxRows * NODE_HEIGHT) + ((maxRows - 1) * ROW_GAP))
    : GRAPH_PADDING * 2 + ((maxLevel + 1) * NODE_HEIGHT) + (maxLevel * ROW_GAP);
  const nodes = [];
  const positions = new Map();
  for (const [level, column] of columns) {
    const crossSize = horizontal
      ? column.length * NODE_HEIGHT + (column.length - 1) * ROW_GAP
      : column.length * NODE_WIDTH + (column.length - 1) * COLUMN_GAP;
    const crossStart = ((horizontal ? height : width) - crossSize) / 2;
    column.forEach((station, row) => {
      const node = {
        ...station,
        x: horizontal ? GRAPH_PADDING + level * (NODE_WIDTH + COLUMN_GAP) : crossStart + row * (NODE_WIDTH + COLUMN_GAP),
        y: horizontal ? crossStart + row * (NODE_HEIGHT + ROW_GAP) : GRAPH_PADDING + level * (NODE_HEIGHT + ROW_GAP),
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
      };
      nodes.push(node);
      positions.set(node.id, node);
    });
  }
  const edges = [];
  for (const target of nodes) {
    for (const dependency of target.dependencies || []) {
      const source = positions.get(dependency);
      if (source) edges.push({ source, target });
    }
  }
  return { width, height, direction, nodes, edges };
}

function edgePath(source, target, direction) {
  if (direction === "vertical") {
    const x1 = source.x + source.width / 2;
    const y1 = source.y + source.height;
    const x2 = target.x + target.width / 2;
    const y2 = target.y;
    const bend = Math.max(28, (y2 - y1) / 2);
    return `M ${x1} ${y1} C ${x1} ${y1 + bend}, ${x2} ${y2 - bend}, ${x2} ${y2}`;
  }
  const x1 = source.x + source.width;
  const y1 = source.y + source.height / 2;
  const x2 = target.x;
  const y2 = target.y + target.height / 2;
  const bend = Math.max(36, (x2 - x1) / 2);
  return `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`;
}

function renderJourney(run, selectedTaskId, options = {}) {
  const graph = layoutJourney(run, options);
  const edges = graph.edges.map(({ source, target }) => `
    <path class="journey-edge journey-edge-${escapeHtml(target.status)}" d="${edgePath(source, target, graph.direction)}" marker-end="url(#journey-arrow)" />`).join("");
  const nodes = graph.nodes.map((station, index) => {
    const dependencyText = station.dependencies?.length
      ? `Depends on ${station.dependencies.join(", ")}`
      : "No dependencies";
    const selected = station.id === selectedTaskId;
    const marker = station.status === "succeeded" || station.status === "pass"
      ? "&#10003;"
      : station.kind === "final-verification" ? "&#9670;" : index + 1;
    return `
      <button type="button" class="journey-station journey-stop-${escapeHtml(station.status)} ${selected ? "selected" : ""}" data-task-id="${escapeHtml(station.id)}" aria-pressed="${selected}" aria-label="${escapeHtml(`${station.title}, ${station.phase}, ${dependencyText}`)}" style="left:${station.x}px;top:${station.y}px;width:${station.width}px;height:${station.height}px">
        <span class="journey-station-marker" aria-hidden="true">${marker}</span>
        <span class="journey-station-copy">
          <span class="journey-station-title">${escapeHtml(station.title)}</span>
          <span class="journey-station-meta">${escapeHtml(station.phase)}${station.kind === "task" ? ` &middot; ${station.attempts}/${station.maxAttempts || "-"} attempts` : ""}</span>
          <span class="journey-dependencies">${escapeHtml(dependencyText)}</span>
          <span class="journey-attempt-trail">${renderAttemptTrail(station)}</span>
        </span>
      </button>`;
  }).join("");

  return `<div class="journey-canvas" data-graph-width="${graph.width}" data-graph-height="${graph.height}" style="width:${graph.width}px;height:${graph.height}px">
    <svg class="journey-edges" width="${graph.width}" height="${graph.height}" viewBox="0 0 ${graph.width} ${graph.height}" aria-hidden="true">
      <defs><marker id="journey-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z"></path></marker></defs>
      ${edges}
    </svg>
    ${nodes}
  </div>`;
}

export { layoutJourney, renderJourney };
