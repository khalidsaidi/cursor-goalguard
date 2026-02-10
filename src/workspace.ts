import * as vscode from "vscode";
import type { LoadedTemplates, Template } from "./types";

export type InitOptions = {
  force?: boolean;
  output?: vscode.OutputChannel;
};

const enc = (s: string) => Buffer.from(s, "utf8");

async function exists(uri: vscode.Uri): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(uri);
    return true;
  } catch {
    return false;
  }
}

async function ensureDir(uri: vscode.Uri): Promise<void> {
  if (!(await exists(uri))) {
    await vscode.workspace.fs.createDirectory(uri);
  }
}

async function readText(uri: vscode.Uri): Promise<string> {
  const buf = await vscode.workspace.fs.readFile(uri);
  return Buffer.from(buf).toString("utf8");
}

function hasYamlFrontmatter(s: string): boolean {
  return s.trimStart().startsWith("---");
}

function isAgentFilePath(p: string): boolean {
  return p.startsWith(".cursor/agents/") && p.endsWith(".md");
}

function isManagedContent(s: string, t: LoadedTemplates): boolean {
  return s.includes(t.MANAGED_MARKER) || s.includes(t.MANAGED_HTML_MARKER) || /"goalguardManaged"\s*:\s*true/.test(s);
}

async function writeFile(uri: vscode.Uri, content: string): Promise<void> {
  await vscode.workspace.fs.writeFile(uri, enc(content));
}

async function writeTemplate(
  root: vscode.Uri,
  tpl: Template,
  opts: InitOptions,
  t: LoadedTemplates
): Promise<"created" | "skipped" | "overwritten"> {
  const uri = vscode.Uri.joinPath(root, ...tpl.path.split("/"));
  const parent = vscode.Uri.joinPath(root, ...tpl.path.split("/").slice(0, -1));
  await ensureDir(parent);

  const force = Boolean(opts.force);

  if (!(await exists(uri))) {
    await writeFile(uri, tpl.content);
    return "created";
  }

  const existing = await readText(uri);

  // Auto-repair: if managed agent file has lost YAML frontmatter, rewrite it.
  if (
    !force &&
    tpl.managed &&
    isAgentFilePath(tpl.path) &&
    isManagedContent(existing, t) &&
    !hasYamlFrontmatter(existing)
  ) {
    opts.output?.appendLine(`[repair] restoring YAML frontmatter for: ${tpl.path}`);
    await writeFile(uri, tpl.content);
    return "overwritten";
  }

  if (!force) return "skipped";

  // Force reinstall: overwrite only managed files.
  if (!tpl.managed) return "skipped";

  // Force reinstall safety: never overwrite user-edited files unless they still look managed.
  if (!isManagedContent(existing, t)) {
    opts.output?.appendLine(`[skip] not managed (won't overwrite): ${tpl.path}`);
    return "skipped";
  }

  await writeFile(uri, tpl.content);
  return "overwritten";
}

async function patchGitignore(root: vscode.Uri): Promise<void> {
  const gi = vscode.Uri.joinPath(root, ".gitignore");
  // NOTE: use `.ai/*` (not `.ai/`) so exceptions can re-include specific files.
  const block = ["", "# GoalGuard (Two-Layer Agent)", ".ai/*", "!.ai/README.md", "!.ai/.gitignore", ""].join("\n");

  if (!(await exists(gi))) {
    await writeFile(gi, block.trimStart());
    return;
  }

  const current = await readText(gi);
  if (current.includes("# GoalGuard (Two-Layer Agent)")) return;
  await writeFile(gi, current.replace(/\s*$/, "") + block);
}

export async function initWorkspaceFolders(
  folders: readonly vscode.WorkspaceFolder[],
  opts: InitOptions,
  t: LoadedTemplates
): Promise<void> {
  for (const folder of folders) {
    const root = folder.uri;

    // Ensure top-level dirs that we rely on
    await ensureDir(vscode.Uri.joinPath(root, ".ai"));
    await ensureDir(vscode.Uri.joinPath(root, ".ai", "runs"));
    await ensureDir(vscode.Uri.joinPath(root, ".ai", "scratch"));
    await ensureDir(vscode.Uri.joinPath(root, ".ai", "work-orders"));

    await ensureDir(vscode.Uri.joinPath(root, ".cursor"));
    await ensureDir(vscode.Uri.joinPath(root, ".cursor", "rules"));
    await ensureDir(vscode.Uri.joinPath(root, ".cursor", "agents"));
    await ensureDir(vscode.Uri.joinPath(root, ".cursor", "commands"));
    await ensureDir(vscode.Uri.joinPath(root, ".cursor", "skills"));
    await ensureDir(vscode.Uri.joinPath(root, ".cursor", "skills", "goalguard-supervisor"));

    // Write templates
    for (const tpl of t.WORKSPACE_TEMPLATES) {
      const res = await writeTemplate(root, tpl, opts, t);
      if (res === "created") opts.output?.appendLine(`[create] ${tpl.path}`);
      if (res === "overwritten") opts.output?.appendLine(`[write] ${tpl.path}`);
    }

    // Patch .gitignore (idempotent)
    await patchGitignore(root);

    // Manifest (ignored; internal)
    const manifest = vscode.Uri.joinPath(root, ".ai", ".goalguard-manifest.json");
    const now = new Date().toISOString();
    const manifestObj = {
      version: 1,
      updatedAt: now,
      templates: t.WORKSPACE_TEMPLATES.map((x) => ({ path: x.path, managed: x.managed }))
    };
    await writeFile(manifest, JSON.stringify(manifestObj, null, 2) + "\n");
  }
}

export async function isWorkspaceEnabled(root: vscode.Uri): Promise<boolean> {
  const rule = vscode.Uri.joinPath(root, ".cursor", "rules", "100-goalguard-two-layer.mdc");
  return exists(rule);
}

export async function doctorWorkspace(
  root: vscode.Uri
): Promise<{ checks: string[]; warnings: string[]; tips: string[] }> {
  const required: Array<[string, vscode.Uri]> = [
    [".cursor/rules/100-goalguard-two-layer.mdc", vscode.Uri.joinPath(root, ".cursor", "rules", "100-goalguard-two-layer.mdc")],
    [".cursor/agents/goalguard-worker.md", vscode.Uri.joinPath(root, ".cursor", "agents", "goalguard-worker.md")],
    [".cursor/agents/goalguard-verifier.md", vscode.Uri.joinPath(root, ".cursor", "agents", "goalguard-verifier.md")],
    [".cursor/agents/goalguard-repo-searcher.md", vscode.Uri.joinPath(root, ".cursor", "agents", "goalguard-repo-searcher.md")],
    [".cursor/commands/goalguard-start.md", vscode.Uri.joinPath(root, ".cursor", "commands", "goalguard-start.md")],
    [".ai/goal.md", vscode.Uri.joinPath(root, ".ai", "goal.md")],
    [".ai/plan.md", vscode.Uri.joinPath(root, ".ai", "plan.md")],
    [".ai/task-ledger.md", vscode.Uri.joinPath(root, ".ai", "task-ledger.md")],
    [".gitignore", vscode.Uri.joinPath(root, ".gitignore")]
  ];

  const checks: string[] = [];
  const warnings: string[] = [];
  const tips: string[] = [];

  for (const [label, uri] of required) {
    checks.push(`${(await exists(uri)) ? "✅" : "❌"} ${label}`);
  }

  // YAML frontmatter check on agent files (common corruption case)
  const agentUris = [
    vscode.Uri.joinPath(root, ".cursor", "agents", "goalguard-worker.md"),
    vscode.Uri.joinPath(root, ".cursor", "agents", "goalguard-verifier.md"),
    vscode.Uri.joinPath(root, ".cursor", "agents", "goalguard-repo-searcher.md")
  ];
  for (const u of agentUris) {
    if (!(await exists(u))) continue;
    const txt = await readText(u);
    if (!txt.trimStart().startsWith("---")) {
      warnings.push(`⚠️ Agent file missing YAML frontmatter: ${u.fsPath}`);
    }
  }

  tips.push("If Start Supervisor cannot auto-send, open Agent chat and type /goalguard-start.");
  tips.push("If subagent delegation fails in your Cursor build, set GoalGuard mode to 'single-chat' and continue (Supervisor runs Worker/Verifier phases itself).");

  return { checks, warnings, tips };
}
