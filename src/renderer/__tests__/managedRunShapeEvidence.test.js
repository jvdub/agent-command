import fs from "fs";
import path from "path";
import { renderInspector } from "../managedRunInspector.js";

test("native phase review cards stay out of the main layout", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "managedRunsView.js"), "utf8");

  expect(source).toContain("elements.shapePanel.hidden = true;");
  expect(source).toContain("elements.specPanel.hidden = true;");
  expect(source).toContain("elements.ticketsPanel.hidden = true;");
});

test("Shape evidence shows the approved documentation commit separately from Tickets", () => {
  const html = renderInspector({
    run: {
      workflowKind: "native", phase: "spec", status: "spec_required", workers: [], tasks: [],
      artifacts: { shape: { summaryRevision: 2, domain: { diff: "diff --git a/CONTEXT.md", changedPaths: ["CONTEXT.md"] } } },
      approvals: { shape: { documentationFingerprint: "abc", documentationCommit: { revision: "1234567890abcdef", message: "docs: record Shape domain decisions", paths: ["CONTEXT.md"] } } },
    },
    taskId: "shape", selectedWorkerId: null,
  });

  expect(html).toContain("Shape evidence");
  expect(html).toContain("1234567890ab");
  expect(html).toContain("docs: record Shape domain decisions");
  expect(html).not.toContain("Selected Task");
});
