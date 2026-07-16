const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const { createManagedRunTicketExecutionService } = require("../managedRunTicketExecutionService");

function git(cwd, args) {
  return execFileSync("git", ["-c", `safe.directory=${cwd}`, ...args], {
    cwd, encoding: "utf8", windowsHide: true,
  }).trim();
}

function repository() {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "ticket-commit-"));
  git(cwd, ["init", "--initial-branch=main"]);
  git(cwd, ["config", "user.name", "Ticket Test"]);
  git(cwd, ["config", "user.email", "ticket@example.com"]);
  fs.writeFileSync(path.join(cwd, "existing.txt"), "before\n");
  git(cwd, ["add", "existing.txt"]); git(cwd, ["commit", "-m", "Initial commit"]);
  const remote = `${cwd}-remote.git`;
  fs.mkdirSync(remote); git(remote, ["init", "--bare", "--initial-branch=main"]);
  git(cwd, ["remote", "add", "origin", remote]); git(cwd, ["push", "-u", "origin", "main"]);
  return cwd;
}

test("commits exactly the unchanged reviewed change set without pushing", async () => {
  const cwd = repository();
  fs.writeFileSync(path.join(cwd, "existing.txt"), "after\n");
  fs.writeFileSync(path.join(cwd, "new.txt"), "new\n");
  const service = createManagedRunTicketExecutionService();

  const remoteBefore = git(cwd, ["rev-parse", "origin/main"]);
  const reviewed = await service.capture(cwd);
  expect(reviewed.changedFiles).toEqual(["existing.txt", "new.txt"]);
  const result = await service.commitReviewed(cwd, reviewed.fingerprint, {
    id: "ticket-a", title: "Deliver the visible slice",
  });

  expect(result.changedFiles).toEqual(reviewed.changedFiles);
  expect(git(cwd, ["show", "--pretty=format:", "--name-only", result.revision]).split(/\r?\n/u).filter(Boolean).sort()).toEqual(reviewed.changedFiles);
  expect(git(cwd, ["status", "--porcelain"])).toBe("");
  expect(git(cwd, ["rev-parse", "origin/main"])).toBe(remoteBefore);
});

test("invalidates verification when the reviewed diff changes", async () => {
  const cwd = repository();
  fs.writeFileSync(path.join(cwd, "existing.txt"), "reviewed\n");
  const service = createManagedRunTicketExecutionService();
  const reviewed = await service.capture(cwd);
  fs.writeFileSync(path.join(cwd, "existing.txt"), "changed later\n");

  await expect(service.commitReviewed(cwd, reviewed.fingerprint, {
    id: "ticket-a", title: "Deliver the visible slice",
  })).rejects.toThrow(/changed after verification/i);
  expect(git(cwd, ["log", "--oneline"])).toContain("Initial commit");
});


test("worker environment permits inspection but blocks worker-owned Git history and push commands", async () => {
  const cwd = repository();
  const service = createManagedRunTicketExecutionService();
  const environment = await service.workerEnvironment(fs.mkdtempSync(path.join(os.tmpdir(), "ticket-guard-")));
  expect(execFileSync("git", ["status", "--short"], { cwd, env: { ...process.env, ...environment }, encoding: "utf8" })).toBe("");
  expect(() => execFileSync("git", ["commit", "--allow-empty", "-m", "worker commit"], { cwd, env: { ...process.env, ...environment }, encoding: "utf8" })).toThrow();
  expect(() => execFileSync("git", ["push", "origin", "main"], { cwd, env: { ...process.env, ...environment }, encoding: "utf8" })).toThrow();
});
