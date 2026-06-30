const EMPTY_MARKERS = new Set(["_None_", "_Not recorded_", "None"]);

function text(value, fallback = "_None_") {
  const result = String(value || "").trim();
  return result || fallback;
}

function list(values) {
  const items = Array.isArray(values) ? values.filter(Boolean) : [];
  return items.length ? items.map((item) => `- ${item}`).join("\n") : "_None_";
}

function planToMarkdown(plan) {
  if (!plan) return "";
  const inspection = plan.inspection || {};
  const tasks = Array.isArray(plan.tasks) ? plan.tasks : [];
  const taskMarkdown = tasks.map((task) => `## Task \`${task.id}\`: ${task.title}

### Objective

${text(task.objective)}

### Success criteria

${list(task.successCriteria)}

### Dependencies

${list(task.dependencies)}

### Relevant scope

${list(task.relevantScope)}

### Implementation tier

${text(task.implementationTier, "standard")}

### Verification tier

${text(task.verificationTier, "standard")}

### Verification guidance

${list(task.verificationGuidance)}

### Context notes

${list(task.contextNotes)}

### Maximum attempts

${Number(task.maxAttempts || 3)}`).join("\n\n");

  return `# Objective

${text(plan.objective)}

# Repository inspection

## Status

${text(inspection.status, "_Not recorded_")}

## Repository state

${text(inspection.repositoryState, "unknown")}

## Commands run

${list(inspection.commandsRun)}

## Files inspected

${list(inspection.filesInspected)}

## Blocker

${text(inspection.blocker)}

# Success criteria

${list(plan.successCriteria)}

# Constraints

${list(plan.constraints)}

# Non-goals

${list(plan.nonGoals)}

# Risks

${list(plan.risks)}

# Unresolved questions

${list(plan.unresolvedQuestions)}

# Final verification guidance

${list(plan.finalVerificationGuidance)}

# Tasks

${taskMarkdown}
`;
}

function splitSections(lines, headingPrefix) {
  const sections = new Map();
  let heading = null;
  let content = [];
  function save() {
    if (heading !== null) sections.set(heading.toLowerCase(), content);
  }
  for (const line of lines) {
    if (line.startsWith(headingPrefix) && !line.startsWith(`${headingPrefix}#`)) {
      save();
      heading = line.slice(headingPrefix.length).trim();
      content = [];
    } else if (heading !== null) {
      content.push(line);
    }
  }
  save();
  return sections;
}

function scalar(lines = []) {
  const result = lines.join("\n").trim();
  return EMPTY_MARKERS.has(result) ? "" : result;
}

function bullets(lines = []) {
  const result = lines
    .map((line) => line.match(/^\s*-\s+(.+)$/u)?.[1]?.trim())
    .filter(Boolean);
  return result.length === 1 && EMPTY_MARKERS.has(result[0]) ? [] : result;
}

function subsection(lines, name) {
  return splitSections(lines, "### ").get(name.toLowerCase()) || [];
}

function markdownToPlan(markdown) {
  const source = String(markdown || "").trim();
  if (!source) throw new Error("Plan Markdown is empty.");
  const lines = source.split(/\r?\n/u);
  const top = splitSections(lines, "# ");
  const objective = scalar(top.get("objective"));
  const taskLines = top.get("tasks") || [];
  if (!objective) throw new Error('Plan Markdown requires a "# Objective" section.');

  const inspectionLines = top.get("repository inspection") || [];
  const inspectionSections = splitSections(inspectionLines, "## ");
  const tasks = [];
  let current = null;
  for (const line of taskLines) {
    const match = line.match(/^## Task `([^`]+)`: (.+)$/u);
    if (match) {
      if (current) tasks.push(current);
      current = { id: match[1].trim(), title: match[2].trim(), lines: [] };
    } else if (current) {
      current.lines.push(line);
    }
  }
  if (current) tasks.push(current);
  if (!tasks.length) {
    throw new Error('Plan Markdown requires at least one "## Task `id`: title" section.');
  }

  return {
    objective,
    inspection: inspectionLines.length
      ? {
          status: scalar(inspectionSections.get("status")),
          repositoryState: scalar(inspectionSections.get("repository state")) || "unknown",
          commandsRun: bullets(inspectionSections.get("commands run")),
          filesInspected: bullets(inspectionSections.get("files inspected")),
          blocker: scalar(inspectionSections.get("blocker")) || null,
        }
      : null,
    successCriteria: bullets(top.get("success criteria")),
    constraints: bullets(top.get("constraints")),
    nonGoals: bullets(top.get("non-goals")),
    risks: bullets(top.get("risks")),
    unresolvedQuestions: bullets(top.get("unresolved questions")),
    finalVerificationGuidance: bullets(top.get("final verification guidance")),
    tasks: tasks.map((task) => ({
      id: task.id,
      title: task.title,
      objective: scalar(subsection(task.lines, "objective")),
      successCriteria: bullets(subsection(task.lines, "success criteria")),
      dependencies: bullets(subsection(task.lines, "dependencies")),
      relevantScope: bullets(subsection(task.lines, "relevant scope")),
      implementationTier: scalar(subsection(task.lines, "implementation tier")) || "standard",
      verificationTier: scalar(subsection(task.lines, "verification tier")) || "standard",
      verificationGuidance: bullets(subsection(task.lines, "verification guidance")),
      contextNotes: bullets(subsection(task.lines, "context notes")),
      maxAttempts: Number(scalar(subsection(task.lines, "maximum attempts")) || 3),
    })),
  };
}

export { markdownToPlan, planToMarkdown };
