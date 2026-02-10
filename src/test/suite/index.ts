import * as path from "node:path";
import * as fs from "node:fs/promises";
import Mocha from "mocha";

export async function run(): Promise<void> {
  // Default Mocha timeout (2s) is too tight on slower CI runners (notably macOS).
  const mocha = new Mocha({ ui: "tdd", color: true, timeout: 20000 });
  const testsRoot = path.resolve(__dirname);

  const entries = await fs.readdir(testsRoot);
  for (const e of entries) {
    if (e.endsWith(".test.js")) mocha.addFile(path.resolve(testsRoot, e));
  }

  await new Promise<void>((resolve, reject) => {
    mocha.run((failures: number) => {
      if (failures > 0) reject(new Error(`${failures} tests failed.`));
      else resolve();
    });
  });
}
