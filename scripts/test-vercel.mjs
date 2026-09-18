import { spawn } from "node:child_process";
import { readdir } from "node:fs/promises";
import path from "node:path";

const testDirectory = path.resolve("control-plane/vercel/src");
const tests = (await readdir(testDirectory))
  .filter((file) => file.endsWith(".test.mjs"))
  .sort()
  .map((file) => path.join(testDirectory, file));
const child = spawn(process.execPath, ["--test", ...tests], { stdio: "inherit" });

child.on("exit", (code, signal) => {
  process.exitCode = signal ? 1 : (code ?? 1);
});
