import * as vscode from "vscode";

/**
 * Best-effort: open a Cursor Agent chat and inject a prompt.
 * Cursor command surface varies by version; we try multiple strategies.
 *
 * If we cannot auto-send, we copy prompt to clipboard and ask the user to paste+enter once.
 */
export async function openAgentAndSendPrompt(
  prompt: string,
  preferDirect: boolean,
  output?: vscode.OutputChannel
): Promise<void> {
  const tryExec = async (cmd: string, ...args: any[]): Promise<boolean> => {
    try {
      await vscode.commands.executeCommand(cmd, ...args);
      output?.appendLine(`[cmd ok] ${cmd}`);
      return true;
    } catch (e) {
      output?.appendLine(`[cmd fail] ${cmd} :: ${String((e as any)?.message || e)}`);
      return false;
    }
  };

  // 1) Direct “open chat with prompt” commands (best case).
  if (preferDirect) {
    const directAttempts: Array<[string, any[]]> = [
      ["cursor.startComposerPrompt", [prompt]],
      ["cursor.startComposer", [prompt]],
      ["workbench.action.chat.open", [prompt]]
    ];
    for (const [cmd, args] of directAttempts) {
      if (await tryExec(cmd, ...args)) return;
    }
  }

  // 2) Open a new agent chat (no prompt) then paste+submit.
  const openAttempts = [
    "composer.newAgentChat",
    "composer.openAgent",
    "workbench.action.chat.newChat",
    "workbench.action.chat.open"
  ];
  for (const cmd of openAttempts) {
    if (await tryExec(cmd)) break;
  }

  // Try to focus chat input (best-effort).
  const focusAttempts = ["workbench.action.chat.focusInput", "cursor.chat.focusInput", "composer.focus"];
  for (const cmd of focusAttempts) {
    await tryExec(cmd);
  }

  // Clipboard fallback paste.
  const originalClipboard = await vscode.env.clipboard.readText();
  await vscode.env.clipboard.writeText(prompt);

  // Give UI a moment.
  await new Promise((r) => setTimeout(r, 250));

  // Paste into focused input if possible.
  await tryExec("editor.action.clipboardPasteAction");

  // Try submit variants.
  const submitAttempts = [
    "workbench.action.chat.submit",
    "workbench.action.chat.send",
    "cursor.chat.submit",
    "composer.submit"
  ];
  let submitted = false;
  for (const cmd of submitAttempts) {
    if (await tryExec(cmd)) {
      submitted = true;
      break;
    }
  }

  // Restore clipboard
  await vscode.env.clipboard.writeText(originalClipboard);

  if (!submitted) {
    // Last resort: keep prompt on clipboard for user.
    await vscode.env.clipboard.writeText(prompt);
    vscode.window.showWarningMessage(
      "GoalGuard: Agent chat opened. Supervisor prompt copied to clipboard. Paste it into the Agent input and press Enter once, or type /goalguard-start."
    );
  }
}
