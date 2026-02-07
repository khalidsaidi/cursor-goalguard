import * as vscode from "vscode";
import { initWorkspaceFolders, isWorkspaceEnabled, doctorWorkspace } from "./workspace";
import { openAgentAndSendPrompt } from "./chat";

function getConfig() {
  const cfg = vscode.workspace.getConfiguration("goalguard");
  return {
    autoPromptOnOpen: cfg.get<boolean>("autoPromptOnOpen", true),
    preferDirectPromptCommand: cfg.get<boolean>("preferDirectPromptCommand", true),
    showStatusBar: cfg.get<boolean>("showStatusBar", true)
  };
}

function bootstrapPrompt(): string {
  return [
    "You are the GoalGuard SUPERVISOR in a two-layer setup (Supervisor ↔ Worker).",
    "",
    "Start by reading these workspace memory files:",
    "- .ai/goal.md",
    "- .ai/state.json",
    "- .ai/plan.md",
    "",
    "If goal.md is placeholder, ask the user for the real goal and update it.",
    "Then write a short plan with checkpoints to .ai/plan.md.",
    "",
    "When implementation is needed, delegate to subagents:",
    "- goalguard-repo-searcher (read-only) to find relevant files",
    "- goalguard-worker to implement scoped tasks",
    "- goalguard-verifier (read-only) to check drift and completeness",
    "",
    "Follow the checkpoint cadence from the always-on rule:",
    "Max 2 worker rounds + 1 verifier round per checkpoint before updating the user.",
    "",
    "Now ask the user: What are we building today, and what does 'done' look like?"
  ].join("\n");
}

function workspaceKey(root: vscode.Uri): string {
  return `goalguard:suppressEnablePrompt:${root.toString()}`;
}

export function activate(context: vscode.ExtensionContext) {
  const output = vscode.window.createOutputChannel("GoalGuard");
  output.appendLine("GoalGuard activated.");

  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusBar.text = "$(shield) GoalGuard";
  statusBar.tooltip = "GoalGuard: Two-Layer Agents enabled in this workspace";
  statusBar.command = "goalguard.doctor";
  context.subscriptions.push(statusBar);

  const updateStatusBar = async () => {
    const cfg = getConfig();
    if (!cfg.showStatusBar) {
      statusBar.hide();
      return;
    }
    const folders = vscode.workspace.workspaceFolders;
    if (!folders?.length) {
      statusBar.hide();
      return;
    }
    const enabled = await isWorkspaceEnabled(folders[0].uri);
    if (enabled) statusBar.show();
    else statusBar.hide();
  };

  const enableWorkspace = async (force = false) => {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders?.length) {
      vscode.window.showErrorMessage("GoalGuard: No workspace folder open.");
      return;
    }
    output.show(true);
    output.appendLine(`Initializing GoalGuard (force=${force})...`);
    await initWorkspaceFolders(folders, { force, output });
    vscode.window.showInformationMessage("GoalGuard: Workspace enabled.");
    await updateStatusBar();
  };

  const startSupervisor = async () => {
    const cfg = getConfig();
    await enableWorkspace(false);

    const folders = vscode.workspace.workspaceFolders;
    if (!folders?.length) return;

    output.appendLine("Opening Agent chat with Supervisor bootstrap prompt...");
    await openAgentAndSendPrompt(bootstrapPrompt(), cfg.preferDirectPromptCommand, output);
  };

  const doctor = async () => {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders?.length) {
      vscode.window.showErrorMessage("GoalGuard: No workspace folder open.");
      return;
    }
    const lines = await doctorWorkspace(folders[0].uri);
    const doc = lines.join("\n");
    output.show(true);
    output.appendLine("Doctor report:");
    output.appendLine(doc);
    vscode.window.showInformationMessage("GoalGuard: Doctor report written to Output → GoalGuard.");
    await updateStatusBar();
  };

  // Commands
  context.subscriptions.push(
    vscode.commands.registerCommand("goalguard.enableWorkspace", async () => enableWorkspace(false)),
    vscode.commands.registerCommand("goalguard.startSupervisor", startSupervisor),
    vscode.commands.registerCommand("goalguard.doctor", doctor),
    vscode.commands.registerCommand("goalguard.forceReinstall", async () => {
      const ok = await vscode.window.showWarningMessage(
        "Force reinstall will overwrite GoalGuard-managed files. Continue?",
        { modal: true },
        "Yes"
      );
      if (ok === "Yes") await enableWorkspace(true);
    })
  );

  // Auto-prompt to enable on open (1-click UX)
  const maybePromptEnable = async () => {
    const cfg = getConfig();
    if (!cfg.autoPromptOnOpen) return;

    const folders = vscode.workspace.workspaceFolders;
    if (!folders?.length) return;

    const root = folders[0].uri;
    const suppressed = context.globalState.get<boolean>(workspaceKey(root), false);
    if (suppressed) return;

    if (await isWorkspaceEnabled(root)) {
      await updateStatusBar();
      return;
    }

    const choice = await vscode.window.showInformationMessage(
      "GoalGuard can enable a two-layer Supervisor↔Worker workflow in this workspace. Enable now?",
      "Enable",
      "Not now",
      "Never for this workspace"
    );

    if (choice === "Enable") {
      await enableWorkspace(false);
    } else if (choice === "Never for this workspace") {
      await context.globalState.update(workspaceKey(root), true);
    }
    await updateStatusBar();
  };

  // Activate prompt after startup
  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      void updateStatusBar();
      void maybePromptEnable();
    })
  );

  void updateStatusBar();
  void maybePromptEnable();
}

export function deactivate() {}
