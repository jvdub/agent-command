const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const { createShapeDomainDocumentService } = require("../shapeDomainDocumentService");

function git(cwd, args) {
  return execFileSync("git", ["-c", `safe.directory=${cwd}`, ...args], { cwd, encoding: "utf8" }).trim();
}

function repository() {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "shape-domain-"));
  git(cwd, ["init", "--initial-branch=main"]);
  git(cwd, ["config", "user.name", "Shape Test"]);
  git(cwd, ["config", "user.email", "shape@example.com"]);
  fs.writeFileSync(path.join(cwd, "README.md"), "# App\n");
  git(cwd, ["add", "README.md"]);
  git(cwd, ["commit", "-m", "feat: start app"]);
  return cwd;
}

describe("Shape domain documentation policy", () => {
  test("detects the repository's tracked domain convention and canonical terms", () => {
    const cwd = repository();
    fs.writeFileSync(path.join(cwd, "CONTEXT.md"), "# Language\n\n**Managed Run**: durable workflow\n");
    git(cwd, ["add", "CONTEXT.md"]); git(cwd, ["commit", "-m", "docs: add language"]);
    const service = createShapeDomainDocumentService();

    expect(service.inspect(cwd)).toMatchObject({
      hasConvention: true,
      recognizedPaths: ["CONTEXT.md"],
      canonicalTerms: ["Managed Run"],
    });
  });

  test("rejects a Shape diff that writes outside recognized domain documentation", () => {
    const cwd = repository();
    fs.writeFileSync(path.join(cwd, "CONTEXT.md"), "# Language\n");
    git(cwd, ["add", "CONTEXT.md"]); git(cwd, ["commit", "-m", "docs: add context"]);
    fs.appendFileSync(path.join(cwd, "CONTEXT.md"), "\n**Run**: workflow\n");
    fs.writeFileSync(path.join(cwd, "src.js"), "application write\n");

    expect(() => createShapeDomainDocumentService().preview(cwd)).toThrow(/src\.js.*rejected and restored/i);
    expect(fs.existsSync(path.join(cwd, "src.js"))).toBe(false);
  });

  test("rejects direct project documentation creation when no convention is approved", () => {
    const cwd = repository();
    fs.mkdirSync(path.join(cwd, "docs"));
    fs.writeFileSync(path.join(cwd, "docs", "domain.md"), "# Domain\n");

    expect(() => createShapeDomainDocumentService().preview(cwd)).toThrow(/keep proposed material in the Run Workspace/i);
  });

  test("keeps proposed material outside the worktree until project docs are approved", () => {
    const cwd = repository();
    const runWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), "shape-proposal-"));
    const service = createShapeDomainDocumentService();
    service.saveProposal(runWorkspace, "# Domain\n\n**Run**: workflow\n");

    expect(fs.existsSync(path.join(cwd, "docs", "domain.md"))).toBe(false);
    expect(service.preview(cwd).diff).toBe("");
    expect(service.materializeProposal(cwd, runWorkspace, false)).toEqual({ materialized: false });
    expect(fs.existsSync(path.join(cwd, "docs", "domain.md"))).toBe(false);
  });

  test("fingerprints and commits only the approved documentation diff using history convention", () => {
    const cwd = repository();
    fs.mkdirSync(path.join(cwd, "docs"));
    fs.writeFileSync(path.join(cwd, "docs", "glossary.md"), "# Glossary\n");
    git(cwd, ["add", "docs/glossary.md"]); git(cwd, ["commit", "-m", "docs: add glossary"]);
    fs.appendFileSync(path.join(cwd, "docs", "glossary.md"), "\n**Shape**: decision phase\n");
    const service = createShapeDomainDocumentService();
    const preview = service.preview(cwd);
    const commit = service.commitApproved(cwd, preview.fingerprint);

    expect(preview.diff).toContain("Shape");
    expect(commit).toMatchObject({ fingerprint: preview.fingerprint, message: "docs: record Shape domain decisions" });
    expect(git(cwd, ["status", "--porcelain"])).toBe("");
    expect(git(cwd, ["show", "--name-only", "--format=", "HEAD"])).toBe("docs/glossary.md");
  });
});
