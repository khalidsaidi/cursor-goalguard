import * as assert from "node:assert";
import * as path from "node:path";
import * as vscode from "vscode";

async function statExists(uri: vscode.Uri): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(uri);
    return true;
  } catch {
    return false;
  }
}

async function readText(uri: vscode.Uri): Promise<string> {
  const buf = await vscode.workspace.fs.readFile(uri);
  return Buffer.from(buf).toString("utf8");
}

async function writeText(uri: vscode.Uri, text: string): Promise<void> {
  await vscode.workspace.fs.writeFile(uri, Buffer.from(text, "utf8"));
}

function getTemplateText(relPath: string): string {
  const ext = vscode.extensions.getExtension("khalidsaidi.cursor-goalguard");
  assert.ok(ext, "Expected extension to be available");
  const mod: any = require(path.join(ext.extensionPath, "assets", "workspace-templates.cjs"));
  const tpls: Array<{ path: string; content: string }> = mod?.WORKSPACE_TEMPLATES || [];
  const hit = tpls.find((t) => t.path === relPath);
  assert.ok(hit, `Missing template for: ${relPath}`);
  return hit.content;
}

suite("GoalGuard Extension", () => {
  test("Enable in Workspace writes templates for each workspace folder", async () => {
    const folders = vscode.workspace.workspaceFolders;
    assert.ok(folders?.length, "No workspace folders for tests");

    await vscode.commands.executeCommand("goalguard.enableWorkspace");

    const requiredRel = [
      ".ai/goal.md",
      ".ai/plan.md",
      ".ai/task-ledger.md",
      ".cursor/rules/100-goalguard-two-layer.mdc",
      ".cursor/commands/goalguard-start.md",
      ".ai/.goalguard-manifest.json"
    ];

    for (const folder of folders) {
      for (const rel of requiredRel) {
        const uri = vscode.Uri.joinPath(folder.uri, ...rel.split("/"));
        const ok = await statExists(uri);
        assert.ok(ok, `Expected file to exist in ${folder.name}: ${rel}`);
      }

      const gi = vscode.Uri.joinPath(folder.uri, ".gitignore");
      const giText = await readText(gi);
      assert.ok(giText.includes("# GoalGuard (Two-Layer Agent)"), "Expected GoalGuard .gitignore block");
    }
  });

  test("Doctor runs without throwing", async () => {
    await vscode.commands.executeCommand("goalguard.enableWorkspace");
    await vscode.commands.executeCommand("goalguard.doctor");
  });

  test("Enable in Workspace repairs corrupted managed agent YAML frontmatter", async () => {
    const folder = vscode.workspace.workspaceFolders?.[0];
    assert.ok(folder, "No workspace folder for tests");

    await vscode.commands.executeCommand("goalguard.enableWorkspace");

    const workerUri = vscode.Uri.joinPath(folder.uri, ".cursor", "agents", "goalguard-worker.md");
    assert.ok((await statExists(workerUri)), "Expected worker agent file to exist");

    // Corrupt but keep managed marker so repair triggers.
    await writeText(workerUri, "<!-- goalguard:managed -->\n# corrupted\n");

    // Re-run normal init (force=false) - should auto-repair this specific corruption case.
    await vscode.commands.executeCommand("goalguard.enableWorkspace");

    const repaired = await readText(workerUri);
    assert.ok(repaired.trimStart().startsWith("---"), "Expected YAML frontmatter to be restored");
    assert.ok(/name:\s*goalguard-worker/i.test(repaired), "Expected agent YAML to include name: goalguard-worker");
  });

  test("Force reinstall overwrites only managed templates (and never overwrites .ai memory)", async () => {
    const folder = vscode.workspace.workspaceFolders?.[0];
    assert.ok(folder, "No workspace folder for tests");

    await vscode.commands.executeCommand("goalguard.enableWorkspace");

    // 1) .ai memory should never be overwritten by force reinstall.
    const goalUri = vscode.Uri.joinPath(folder.uri, ".ai", "goal.md");
    const goalCustom = "# custom goal\n\nDo not overwrite.\n";
    await writeText(goalUri, goalCustom);

    // 2) Unmanaged override: removing markers should protect the file.
    const rulesUri = vscode.Uri.joinPath(folder.uri, ".cursor", "rules", "100-goalguard-two-layer.mdc");
    const customRules = "---\ndescription: user custom\nalwaysApply: true\n---\n\n# Custom\n\nKeep me.\n";
    await writeText(rulesUri, customRules);

    // 3) Managed override: keeping the managed HTML marker should allow overwrite.
    const cmdUri = vscode.Uri.joinPath(folder.uri, ".cursor", "commands", "goalguard-start.md");
    await writeText(cmdUri, "<!-- goalguard:managed -->\nCUSTOM-COMMAND\n");

    // Execute force mode without modal prompt (test-only command).
    await vscode.commands.executeCommand("goalguard.__testForceReinstall");

    const goalAfter = await readText(goalUri);
    assert.strictEqual(goalAfter, goalCustom, "Expected .ai/goal.md to not be overwritten by force reinstall");

    const rulesAfter = await readText(rulesUri);
    assert.strictEqual(rulesAfter, customRules, "Expected custom rules (no managed marker) to be preserved");

    const cmdAfter = await readText(cmdUri);
    assert.ok(!cmdAfter.includes("CUSTOM-COMMAND"), "Expected managed command file to be overwritten");
    assert.ok(cmdAfter.includes("# /goalguard-start"), "Expected template command content to be restored");

    // Cleanup: restore templates so later tests / debugging are predictable.
    await writeText(rulesUri, getTemplateText(".cursor/rules/100-goalguard-two-layer.mdc"));
    await writeText(cmdUri, getTemplateText(".cursor/commands/goalguard-start.md"));
  });
});
