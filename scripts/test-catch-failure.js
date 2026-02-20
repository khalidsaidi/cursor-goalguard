#!/usr/bin/env node
"use strict";
/**
 * Proves the verify script catches failures: run init, remove a required file,
 * run assertions — must FAIL. If this script exits 0, the test "catch failure" passed.
 */
const fs = require("fs");
const path = require("path");
const os = require("os");

const workspaceRoot = path.join(os.tmpdir(), "goalguard-catch-failure-" + Date.now());
const templatesPath = path.join(__dirname, "..", "dist", "templates.js");

if (!fs.existsSync(templatesPath)) {
  console.error("Run npm run compile first. Missing:", templatesPath);
  process.exit(1);
}

const { WORKSPACE_TEMPLATES } = require(templatesPath);

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

function exists(filePath) {
  try {
    fs.accessSync(filePath);
    return true;
  } catch {
    return false;
  }
}

function writeFile(filePath, content) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, content, "utf8");
}

function patchGitignore(root) {
  const gi = path.join(root, ".gitignore");
  const block = "\n# GoalGuard (Two-Layer Agent)\n.ai/\n\n";
  if (!exists(gi)) {
    fs.writeFileSync(gi, block.trimStart(), "utf8");
    return;
  }
  const current = fs.readFileSync(gi, "utf8");
  if (current.includes("# GoalGuard (Two-Layer Agent)") || current.includes("\n.ai/")) return;
  fs.writeFileSync(gi, current.replace(/\s*$/, "") + block, "utf8");
}

function runEnable(root) {
  ensureDir(path.join(root, ".ai"));
  ensureDir(path.join(root, ".ai", "runs"));
  ensureDir(path.join(root, ".ai", "scratch"));
  ensureDir(path.join(root, ".ai", "work-orders"));
  ensureDir(path.join(root, ".cursor"));
  ensureDir(path.join(root, ".cursor", "rules"));
  ensureDir(path.join(root, ".cursor", "agents"));
  ensureDir(path.join(root, ".cursor", "commands"));
  ensureDir(path.join(root, ".cursor", "skills"));
  ensureDir(path.join(root, ".cursor", "skills", "goalguard-supervisor"));
  for (const t of WORKSPACE_TEMPLATES) {
    const filePath = path.join(root, ...t.path.split("/"));
    if (!exists(filePath)) {
      writeFile(filePath, t.content);
    }
  }
  patchGitignore(root);
  const manifestPath = path.join(root, ".ai", ".goalguard-manifest.json");
  const now = new Date().toISOString();
  const manifestObj = {
    version: 1,
    installedAt: now,
    updatedAt: now,
    templates: WORKSPACE_TEMPLATES.map((t) => ({ path: t.path, managed: t.managed }))
  };
  writeFile(manifestPath, JSON.stringify(manifestObj, null, 2) + "\n");
}

const FILE_ASSERTIONS = [
  { type: "assertFileExists", path: ".cursor/rules/100-goalguard-two-layer.mdc" },
  { type: "assertFileExists", path: ".ai/goal.md" },
  { type: "assertFileExists", path: ".ai/plan.md" },
  { type: "assertFileContains", path: ".ai/goal.md", contains: "Goal Contract" }
];

function runAssertions(root) {
  const results = [];
  for (const step of FILE_ASSERTIONS) {
    const fullPath = path.join(root, ...step.path.split("/"));
    try {
      if (step.type === "assertFileExists") {
        if (!exists(fullPath)) throw new Error("Expected file to exist: " + step.path);
        results.push({ step: step.path, status: "pass" });
      } else if (step.type === "assertFileContains") {
        if (!exists(fullPath)) throw new Error("File not found: " + step.path);
        const text = fs.readFileSync(fullPath, "utf8");
        if (!text.includes(step.contains)) throw new Error("Expected " + step.path + " to contain: " + step.contains);
        results.push({ step: step.path, status: "pass" });
      }
    } catch (err) {
      results.push({ step: step.path, status: "fail", error: err.message });
    }
  }
  return results;
}

try {
  runEnable(workspaceRoot);
  // Simulate regression: extension forgot to create .ai/goal.md
  const goalPath = path.join(workspaceRoot, ".ai", "goal.md");
  if (fs.existsSync(goalPath)) fs.unlinkSync(goalPath);

  const results = runAssertions(workspaceRoot);
  const failed = results.filter((r) => r.status === "fail");

  if (failed.length === 0) {
    console.error("test-catch-failure: expected assertions to FAIL (missing .ai/goal.md), but all passed.");
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
    process.exit(1);
  }

  const goalFailed = failed.some((r) => r.step === ".ai/goal.md");
  if (!goalFailed) {
    console.error("test-catch-failure: expected .ai/goal.md assertion to fail, but failed steps:", failed.map((r) => r.step));
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
    process.exit(1);
  }

  console.log("test-catch-failure: PASS — verify correctly caught missing .ai/goal.md (failure detected).");
} finally {
  if (fs.existsSync(workspaceRoot)) fs.rmSync(workspaceRoot, { recursive: true, force: true });
}
process.exit(0);
