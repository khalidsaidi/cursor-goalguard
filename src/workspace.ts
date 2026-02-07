import * as vscode from "vscode";
import { MANAGED_MARKER, MANAGED_HTML_MARKER, WORKSPACE_TEMPLATES, type Template } from "./templates";

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

function isManagedContent(s: string): boolean {
  return (
    s.includes(MANAGED_MARKER) ||
    s.includes(MANAGED_HTML_MARKER) ||
    /"goalguardManaged"\s*:\s*true/.test(s)
  );
}

async function writeFile(uri: vscode.Uri, content: string): Promise<void> {
  await vscode.workspace.fs.writeFile(uri, enc(content));
}

async function writeTemplate(
  root: vscode.Uri,
  t: Template,
  opts: InitOptions
): Promise<"created" | "skipped" | "overwritten"> {
  const uri = vscode.Uri.joinPath(root, ...t.path.split("/"));
  const parent = vscode.Uri.joinPath(root, ...t.path.split("/").slice(0, -1));
  await ensureDir(parent);

  const force = Boolean(opts.force);

  if (!(await exists(uri))) {
    await writeFile(uri, t.content);
    return "created";
  }

  if (!force) return "skipped";

  // Force reinstall: overwrite only if existing file appears managed.
  const existing = await readText(uri);
  if (!isManagedContent(existing)) {
    opts.output?.appendLine(`[skip] not managed (won't overwrite): ${t.path}`);
    return "skipped";
  }

  await writeFile(uri, t.content);
  return "overwritten";
}

async function patchGitignore(root: vscode.Uri): Promise<void> {
  const gi = vscode.Uri.joinPath(root, ".gitignore");
  const block = ["", "# GoalGuard (Two-Layer Agent)", ".ai/", ""].join("\n");

  if (!(await exists(gi))) {
    await writeFile(gi, block.trimStart());
    return;
  }

  const current = await readText(gi);
  if (
    current.includes("# GoalGuard (Two-Layer Agent)") ||
    current.includes("\n.ai/") ||
    current.includes("\r\n.ai/")
  ) {
    return;
  }

  await writeFile(gi, current.replace(/\s*$/, "") + block);
}

export async function initWorkspaceFolders(
  folders: readonly vscode.WorkspaceFolder[],
  opts: InitOptions
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
    for (const t of WORKSPACE_TEMPLATES) {
      const res = await writeTemplate(root, t, opts);
      if (res === "created") opts.output?.appendLine(`[create] ${t.path}`);
      if (res === "overwritten") opts.output?.appendLine(`[overwrite] ${t.path}`);
    }

    // Patch .gitignore (idempotent)
    await patchGitignore(root);

    // Manifest (ignored; internal)
    const manifest = vscode.Uri.joinPath(root, ".ai", ".goalguard-manifest.json");
    const now = new Date().toISOString();
    const manifestObj = {
      version: 1,
      installedAt: now,
      updatedAt: now,
      templates: WORKSPACE_TEMPLATES.map((t) => ({ path: t.path, managed: t.managed }))
    };
    await writeFile(manifest, JSON.stringify(manifestObj, null, 2) + "\n");
  }
}

export async function isWorkspaceEnabled(root: vscode.Uri): Promise<boolean> {
  const rule = vscode.Uri.joinPath(root, ".cursor", "rules", "100-goalguard-two-layer.mdc");
  return exists(rule);
}

export async function doctorWorkspace(root: vscode.Uri): Promise<string[]> {
  const checks: Array<[string, vscode.Uri]> = [
    [
      ".cursor/rules/100-goalguard-two-layer.mdc",
      vscode.Uri.joinPath(root, ".cursor", "rules", "100-goalguard-two-layer.mdc")
    ],
    [
      ".cursor/agents/goalguard-worker.md",
      vscode.Uri.joinPath(root, ".cursor", "agents", "goalguard-worker.md")
    ],
    [
      ".cursor/agents/goalguard-verifier.md",
      vscode.Uri.joinPath(root, ".cursor", "agents", "goalguard-verifier.md")
    ],
    [
      ".cursor/agents/goalguard-repo-searcher.md",
      vscode.Uri.joinPath(root, ".cursor", "agents", "goalguard-repo-searcher.md")
    ],
    [".ai/goal.md", vscode.Uri.joinPath(root, ".ai", "goal.md")],
    [".ai/plan.md", vscode.Uri.joinPath(root, ".ai", "plan.md")],
    [".ai/task-ledger.md", vscode.Uri.joinPath(root, ".ai", "task-ledger.md")],
    [".gitignore", vscode.Uri.joinPath(root, ".gitignore")]
  ];

  const out: string[] = [];
  for (const [label, uri] of checks) {
    out.push(`${(await exists(uri)) ? "✅" : "❌"} ${label}`);
  }
  return out;
}
