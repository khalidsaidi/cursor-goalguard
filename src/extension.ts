import * as vscode from "vscode";
import { loadTemplates } from "./templateLoader";
import { initWorkspaceFolders, isWorkspaceEnabled, doctorWorkspace } from "./workspace";
import { openAgentAndSendPrompt } from "./chat";
import type { LoadedTemplates } from "./types";

function getConfig() {
  const cfg = vscode.workspace.getConfiguration("goalguard");
  return {
    autoPromptOnOpen: cfg.get<boolean>("autoPromptOnOpen", true),
    preferDirectPromptCommand: cfg.get<boolean>("preferDirectPromptCommand", true),
    showStatusBar: cfg.get<boolean>("showStatusBar", true),
    mode: cfg.get<string>("mode", "auto")
  };
}

function bootstrapPrompt(mode: string): string {
  const modeNote =
    mode === "single-chat"
      ? "IMPORTANT: Use SINGLE-CHAT fallback (do not rely on subagents)."
      : "Try subagents first; fall back to single-chat if delegation fails.";

  return [
    "You are the GoalGuard SUPERVISOR in a two-layer setup (Supervisor ↔ Worker).",
    "",
    modeNote,
    "",
    "First read:",
    "- .ai/goal.md",
    "- .ai/state.json",
    "- .ai/plan.md",
    "- .ai/task-ledger.md",
    "",
    "If goal.md is placeholder, ask the user for the real goal and update it.",
    "Then write a short plan with checkpoints to .ai/plan.md.",
    "",
    "If subagents are available, delegate:",
    "- goalguard-repo-searcher (read-only) for file discovery",
    "- goalguard-worker for implementation",
    "- goalguard-verifier (read-only) for drift review",
    "",
    "If subagents are NOT available: do this in one chat:",
    "1) Worker mode: implement ONE small task",
    "2) Verifier mode: check drift + DoD",
    "3) Post a checkpoint update",
    "",
    "Cadence: max 2 worker rounds + 1 verifier round per checkpoint before updating the user.",
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

  // Extension host tests should not be blocked by user prompts.
  const isTest = context.extensionMode === vscode.ExtensionMode.Test;

  const templates: LoadedTemplates = loadTemplates(context);

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
    await initWorkspaceFolders(folders, { force, output }, templates);
    vscode.window.showInformationMessage("GoalGuard: Workspace enabled.");
    await updateStatusBar();
  };

  const startSupervisor = async () => {
    const cfg = getConfig();
    await enableWorkspace(false);

    const folders = vscode.workspace.workspaceFolders;
    if (!folders?.length) return;

    output.appendLine("Opening Agent chat with Supervisor bootstrap prompt...");
    await openAgentAndSendPrompt(bootstrapPrompt(cfg.mode), cfg.preferDirectPromptCommand, output);
  };

  const doctor = async () => {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders?.length) {
      vscode.window.showErrorMessage("GoalGuard: No workspace folder open.");
      return;
    }
    const report = await doctorWorkspace(folders[0].uri);
    output.show(true);
    output.appendLine("Doctor report:");
    for (const c of report.checks) output.appendLine(c);
    if (report.warnings.length) {
      output.appendLine("");
      output.appendLine("Warnings:");
      for (const w of report.warnings) output.appendLine(w);
    }
    output.appendLine("");
    output.appendLine("Tips:");
    for (const t of report.tips) output.appendLine(`- ${t}`);
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
        "Force reinstall will overwrite GoalGuard-managed files (repairs corrupted templates). Continue?",
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
      const start = await vscode.window.showInformationMessage("GoalGuard enabled. Start a Supervisor session now?", "Start", "Later");
      if (start === "Start") await startSupervisor();
    } else if (choice === "Never for this workspace") {
      await context.globalState.update(workspaceKey(root), true);
    }
    await updateStatusBar();
  };

  // Activate prompt after startup
  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      void updateStatusBar();
      if (!isTest) void maybePromptEnable();
    })
  );

  void updateStatusBar();
  if (!isTest) void maybePromptEnable();
}

export function deactivate() {}
