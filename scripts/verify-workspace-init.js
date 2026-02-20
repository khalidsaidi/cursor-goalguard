#!/usr/bin/env node
"use strict";
/**
 * Verify GoalGuard workspace init contract: replicate Enable in Workspace using
 * this repo's templates, then assert the expected files exist and goal.md content.
 * Run without Cursor to prove the file layout is correct.
 * Usage: node scripts/verify-workspace-init.js [workspace-path]
 */
const fs = require("fs");
const path = require("path");

const workspaceRoot = path.resolve(process.argv[2] || process.cwd());
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
      console.log("[create]", t.path);
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

console.log("Workspace:", workspaceRoot);
console.log("Replicating Enable (templates from this repo)...");
runEnable(workspaceRoot);
console.log("Running file assertions...");
const results = runAssertions(workspaceRoot);

const failed = results.filter((r) => r.status === "fail");
for (const r of results) {
  const icon = r.status === "pass" ? "✓" : "✗";
  console.log("  " + icon + " " + r.step + (r.error ? " — " + r.error : ""));
}

if (failed.length) {
  console.log("\nResult: FAIL —", failed.length, "assertion(s) failed");
  process.exit(1);
}
console.log("\nResult: PASS — workspace init contract verified.");
process.exit(0);
