import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("the GitHub App suite is a source gate", async () => {
  const manifest = JSON.parse(
    await readFile(new URL("../../../package.json", import.meta.url), "utf8"),
  );
  assert.match(manifest.scripts["test:github-app"] ?? "", /control-plane\/github-app/u);
  assert.match(manifest.scripts.check, /test:github-app/u);
});
