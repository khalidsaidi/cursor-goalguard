import * as path from "node:path";
import * as os from "node:os";
import * as fs from "node:fs/promises";
import { runTests } from "@vscode/test-electron";

async function main() {
  // Compiled location: `dist/test/runTest.js` -> extension root is 2 levels up.
  const extensionDevelopmentPath = path.resolve(__dirname, "..", "..");
  const extensionTestsPath = path.resolve(__dirname, "./suite/index");

  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "goalguard-vscode-test-"));
  await fs.writeFile(path.join(tmp, "README.md"), "# VS Code Extension Test Workspace\n", "utf8");

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

  try {
    await runTests({
      extensionDevelopmentPath,
      extensionTestsPath,
      launchArgs: [tmp, "--disable-workspace-trust"],
      // Some environments (notably WSL / remote shells) set ELECTRON_RUN_AS_NODE=1 globally.
      // That breaks launching the VS Code binary for extension tests.
      extensionTestsEnv: {
        ELECTRON_RUN_AS_NODE: "",
        VSCODE_IPC_HOOK_CLI: "",
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
