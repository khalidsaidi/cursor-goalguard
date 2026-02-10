import * as path from "node:path";
import * as fs from "node:fs/promises";
import Mocha from "mocha";

export async function run(): Promise<void> {
  const mocha = new Mocha({ ui: "tdd", color: true });
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
