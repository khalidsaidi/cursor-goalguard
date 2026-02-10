import * as assert from "node:assert";
import * as vscode from "vscode";

async function statExists(uri: vscode.Uri): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(uri);
    return true;
  } catch {
    return false;
  }
}

suite("GoalGuard Extension", () => {
  test("Enable in Workspace writes .ai and .cursor templates", async () => {
    const folder = vscode.workspace.workspaceFolders?.[0];
    assert.ok(folder, "No workspace folder for tests");

    await vscode.commands.executeCommand("goalguard.enableWorkspace");

    const requiredRel = [
      ".ai/goal.md",
      ".ai/plan.md",
      ".ai/task-ledger.md",
      ".cursor/rules/100-goalguard-two-layer.mdc",
      ".cursor/commands/goalguard-start.md"
    ];

    for (const rel of requiredRel) {
      const uri = vscode.Uri.joinPath(folder.uri, ...rel.split("/"));
      const ok = await statExists(uri);
      assert.ok(ok, `Expected file to exist: ${rel}`);
    }

    const gi = vscode.Uri.joinPath(folder.uri, ".gitignore");
    const giBuf = await vscode.workspace.fs.readFile(gi);
    const giText = Buffer.from(giBuf).toString("utf8");
    assert.ok(giText.includes("# GoalGuard (Two-Layer Agent)"), "Expected GoalGuard .gitignore block");
  });
});

