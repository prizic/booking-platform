import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const temporaryRoots = [];

async function createRepositoryFixture() {
  const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), "wlbp-config-test-"));
  temporaryRoots.push(fixtureRoot);
  await mkdir(path.join(fixtureRoot, "packages", "config"), { recursive: true });

  await Promise.all([
    cp(
      path.join(repositoryRoot, "instance-template"),
      path.join(fixtureRoot, "instance-template"),
      { recursive: true },
    ),
    cp(path.join(repositoryRoot, "scripts"), path.join(fixtureRoot, "scripts"), {
      recursive: true,
      filter: (source) => !source.endsWith("check-config.test.mjs"),
    }),
    cp(
      path.join(repositoryRoot, "packages", "white-label-ui", "src"),
      path.join(fixtureRoot, "packages", "white-label-ui", "src"),
      { recursive: true },
    ),
    cp(
      path.join(repositoryRoot, "packages", "config", "instance-brand.mjs"),
      path.join(fixtureRoot, "packages", "config", "instance-brand.mjs"),
    ),
    cp(
      path.join(repositoryRoot, "platform-contract.json"),
      path.join(fixtureRoot, "platform-contract.json"),
    ),
  ]);

  for (const app of ["client", "dashboard"]) {
    const destination = path.join(fixtureRoot, "apps", app);
    await mkdir(destination, { recursive: true });
    await cp(
      path.join(repositoryRoot, "apps", app, "instance-locale-policy.json"),
      path.join(destination, "instance-locale-policy.json"),
    );
  }

  return fixtureRoot;
}

async function runWithTheme(mutate) {
  const fixtureRoot = await createRepositoryFixture();
  const themePath = path.join(
    fixtureRoot,
    "instance-template",
    "instance",
    "theme.css",
  );
  const original = await readFile(themePath, "utf8");
  await writeFile(themePath, mutate(original), "utf8");

  return spawnSync(
    process.execPath,
    [path.join(fixtureRoot, "scripts/check-config.mjs")],
    {
      cwd: fixtureRoot,
      encoding: "utf8",
    },
  );
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((fixtureRoot) => rm(fixtureRoot, { recursive: true, force: true })),
  );
});

describe("theme.css configuration validation", () => {
  it("rejects tenant-authored selectors", async () => {
    const result = await runWithTheme(
      (theme) => `${theme}\nbutton { display: none; }\n`,
    );

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /theme\.css has unsupported selector button/u);
  });

  it("rejects extra custom-property declarations", async () => {
    const result = await runWithTheme((theme) =>
      theme.replace(":root {", ":root {\n  --brand-escape-hatch: red;"),
    );

    assert.notEqual(result.status, 0);
    assert.match(
      result.stderr,
      /theme\.css :root has unexpected declaration --brand-escape-hatch/u,
    );
  });

  it("rejects duplicate declarations", async () => {
    const result = await runWithTheme((theme) =>
      theme.replace(":root {", ":root {\n  --brand-color-background: #f3efe5;"),
    );

    assert.notEqual(result.status, 0);
    assert.match(
      result.stderr,
      /theme\.css :root duplicates --brand-color-background/u,
    );
  });

  it("rejects declarations whose values drift from brand.json", async () => {
    const result = await runWithTheme((theme) =>
      theme.replace(
        "--brand-color-background: #f3efe5",
        "--brand-color-background: #000000",
      ),
    );

    assert.notEqual(result.status, 0);
    assert.match(
      result.stderr,
      /theme\.css :root --brand-color-background must equal brand\.json value #f3efe5/u,
    );
  });

  it("rejects a missing declaration", async () => {
    const result = await runWithTheme((theme) =>
      theme.replace(/\s*--brand-space-xs: 0\.5rem;/u, ""),
    );

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /theme\.css :root is missing --brand-space-xs/u);
  });

  it("requires the exact RTL typography override", async () => {
    const result = await runWithTheme((theme) =>
      theme.replace(
        /\n\[dir="rtl"\] \{[\s\S]*?\n\}\n/u,
        '\n[dir="rtl"] {\n  --brand-font-body: serif;\n  --brand-font-display: serif;\n}\n',
      ),
    );

    assert.notEqual(result.status, 0);
    assert.match(
      result.stderr,
      /theme\.css \[dir="rtl"\] --brand-font-body must equal brand\.json value/u,
    );
  });

  it("requires the RTL rule to follow root so the override wins", async () => {
    const result = await runWithTheme((theme) => {
      const root = theme.match(/:root \{[\s\S]*?\n\}/u)?.[0];
      const rtl = theme.match(/\[dir="rtl"\] \{[\s\S]*?\n\}/u)?.[0];
      assert.ok(root);
      assert.ok(rtl);
      return `${rtl}\n\n${root}\n`;
    });

    assert.notEqual(result.status, 0);
    assert.match(
      result.stderr,
      /theme\.css selectors must be ordered :root then \[dir="rtl"\]/u,
    );
  });
});

describe("brand asset configuration validation", () => {
  it("accepts an omitted optional dark logo", async () => {
    const fixtureRoot = await createRepositoryFixture();
    const brandPath = path.join(
      fixtureRoot,
      "instance-template",
      "instance",
      "brand.json",
    );
    const brand = JSON.parse(await readFile(brandPath, "utf8"));
    delete brand.assets.logoDark;
    await writeFile(brandPath, `${JSON.stringify(brand, null, 2)}\n`, "utf8");

    const result = spawnSync(
      process.execPath,
      [path.join(fixtureRoot, "scripts/check-config.mjs")],
      { cwd: fixtureRoot, encoding: "utf8" },
    );

    assert.equal(result.status, 0, result.stderr);
  });
});
