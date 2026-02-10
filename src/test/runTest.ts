import * as path from "node:path";
import * as os from "node:os";
import * as fs from "node:fs/promises";
import { runTests } from "@vscode/test-electron";

async function main() {
  // Compiled location: `dist/test/runTest.js` -> extension root is 2 levels up.
  const extensionDevelopmentPath = path.resolve(__dirname, "..", "..");
  const extensionTestsPath = path.resolve(__dirname, "./suite/index");

  // Use a multi-root workspace to validate folder iteration behavior.
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "goalguard-vscode-test-"));
  const wsA = path.join(tmp, "ws-a");
  const wsB = path.join(tmp, "ws-b");
  await fs.mkdir(wsA, { recursive: true });
  await fs.mkdir(wsB, { recursive: true });
  await fs.writeFile(path.join(wsA, "README.md"), "# VS Code Extension Test Workspace A\n", "utf8");
  await fs.writeFile(path.join(wsB, "README.md"), "# VS Code Extension Test Workspace B\n", "utf8");

  const workspaceFile = path.join(tmp, "goalguard.code-workspace");
  await fs.writeFile(
    workspaceFile,
    JSON.stringify(
      {
        folders: [{ path: wsA }, { path: wsB }],
        settings: {
          // Prevent any user prompts from blocking tests even outside `ExtensionMode.Test`.
          "goalguard.autoPromptOnOpen": false
        }
      },
      null,
      2
    ) + "\n",
    "utf8"
  );

  // Some minimal Linux environments are missing shared libs required by the VS Code test binary.
  // If the user has extracted libs into `.vscode-test/system-libs`, add it to LD_LIBRARY_PATH.
  let extraLdLibraryPath = "";
  if (process.platform === "linux") {
    const candidate = path.join(
      extensionDevelopmentPath,
      ".vscode-test",
      "system-libs",
      "usr",
      "lib",
      "x86_64-linux-gnu"
    );
    try {
      const st = await fs.stat(candidate);
      if (st.isDirectory()) extraLdLibraryPath = candidate;
    } catch {
      // ignore
    }
  }

  // Some environments set these globally (notably WSL / some CI runners).
  // Electron treats the mere presence of ELECTRON_RUN_AS_NODE as enabling node-mode on some platforms,
  // so we must UNSET it (not set it to an empty string).
  delete process.env.ELECTRON_RUN_AS_NODE;
  delete process.env.VSCODE_IPC_HOOK_CLI;

  try {
    await runTests({
      extensionDevelopmentPath,
      extensionTestsPath,
      launchArgs: [workspaceFile, "--disable-workspace-trust"],
      extensionTestsEnv: {
        ...(extraLdLibraryPath
          ? { LD_LIBRARY_PATH: `${extraLdLibraryPath}${process.env.LD_LIBRARY_PATH ? `:${process.env.LD_LIBRARY_PATH}` : ""}` }
          : {})
      }
    });
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
