#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { WORKSPACE_TEMPLATES, MANAGED_MARKER, MANAGED_HTML_MARKER } = require("../assets/workspace-templates.cjs");

function parseArgs(argv) {
  const args = { workspace: process.cwd(), force: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--workspace" || a === "-w") args.workspace = argv[++i];
    else if (a === "--force" || a === "-f") args.force = true;
    else if (a === "--help" || a === "-h") {
      console.log("Usage: goalguard-init.mjs [--workspace <path>] [--force]");
      process.exit(0);
    }
  }
  return args;
}

async function exists(p) {
  try {
    await fs.stat(p);
    return true;
  } catch {
    return false;
  }
}

function isManagedContent(s) {
  return s.includes(MANAGED_MARKER) || s.includes(MANAGED_HTML_MARKER) || /"goalguardManaged"\s*:\s*true/.test(s);
}

function hasYamlFrontmatter(s) {
  return s.trimStart().startsWith("---");
}

function isAgentFilePath(rel) {
  return rel.startsWith(".cursor/agents/") && rel.endsWith(".md");
}

async function ensureDir(p) {
  await fs.mkdir(p, { recursive: true });
}

async function writeFile(p, content) {
  await ensureDir(path.dirname(p));
  await fs.writeFile(p, content, "utf8");
}

async function patchGitignore(root) {
  const gi = path.join(root, ".gitignore");
  // NOTE: use `.ai/*` (not `.ai/`) so exceptions can re-include specific files.
  const block = ["", "# GoalGuard (Two-Layer Agent)", ".ai/*", "!.ai/README.md", "!.ai/.gitignore", ""].join("\n");

  if (!(await exists(gi))) {
    await fs.writeFile(gi, block.trimStart(), "utf8");
    return;
  }
  const current = await fs.readFile(gi, "utf8");
  if (current.includes("# GoalGuard (Two-Layer Agent)")) return;
  await fs.writeFile(gi, current.replace(/\s*$/, "") + block, "utf8");
}

async function writeTemplate(root, tpl, force) {
  const abs = path.join(root, ...tpl.path.split("/"));
  if (!(await exists(abs))) {
    await writeFile(abs, tpl.content);
    return "created";
  }
  const existing = await fs.readFile(abs, "utf8");

  // Repair: managed agent file missing YAML frontmatter.
  if (!force && tpl.managed && isAgentFilePath(tpl.path) && isManagedContent(existing) && !hasYamlFrontmatter(existing)) {
    await writeFile(abs, tpl.content);
    return "overwritten";
  }

  if (!force) return "skipped";
  if (!tpl.managed) return "skipped";
  if (!isManagedContent(existing)) return "skipped";
  await writeFile(abs, tpl.content);
  return "overwritten";
}

async function main() {
  const args = parseArgs(process.argv);
  const root = path.resolve(args.workspace);

  // Ensure a few dirs even if templates change.
  await ensureDir(path.join(root, ".ai", "runs"));
  await ensureDir(path.join(root, ".ai", "scratch"));
  await ensureDir(path.join(root, ".ai", "work-orders"));
  await ensureDir(path.join(root, ".cursor", "rules"));
  await ensureDir(path.join(root, ".cursor", "agents"));
  await ensureDir(path.join(root, ".cursor", "commands"));
  await ensureDir(path.join(root, ".cursor", "skills", "goalguard-supervisor"));

  for (const tpl of WORKSPACE_TEMPLATES) {
    await writeTemplate(root, tpl, args.force);
  }

  await patchGitignore(root);

  const manifest = {
    version: 1,
    updatedAt: new Date().toISOString(),
    templates: WORKSPACE_TEMPLATES.map((t) => ({ path: t.path, managed: t.managed }))
  };
  await writeFile(path.join(root, ".ai", ".goalguard-manifest.json"), JSON.stringify(manifest, null, 2) + "\n");

  console.log(`[GoalGuard] Initialized workspace at: ${root}`);
}

main().catch((e) => {
  console.error("[GoalGuard] init failed:", e);
  process.exit(1);
});
