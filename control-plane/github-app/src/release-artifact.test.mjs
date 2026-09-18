import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { readDistributionArtifact } from "./release-artifact.mjs";

function digest(contents) {
  return createHash("sha256").update(contents).digest("hex");
}

async function createArtifact() {
  const root = await mkdtemp(path.join(os.tmpdir(), "wlbp-release-artifact-"));
  const contents = Buffer.from('{"name":"instance"}\n');
  const entry = {
    bytes: contents.length,
    path: "package.json",
    sha256: digest(contents),
  };
  const manifest = {
    backendContract: { max: 1, min: 1 },
    configSchemaVersion: 3,
    fileCount: 1,
    files: [entry],
    members: ["apps/client", "apps/dashboard"],
    schemaVersion: 1,
    treeSha256: digest(`${entry.path}:${entry.sha256}\n`),
    whiteLabelVersion: "0.1.0",
  };
  await writeFile(path.join(root, "package.json"), contents);
  await writeFile(
    path.join(root, "distribution-manifest.json"),
    `${JSON.stringify(manifest)}\n`,
  );
  return { manifest, root };
}

test("reads only the manifest-checked distribution bytes for a repository seed", async () => {
  const { manifest, root } = await createArtifact();
  try {
    const artifact = await readDistributionArtifact(root);
    assert.deepEqual(artifact, {
      backendContract: { max: 1, min: 1 },
      configSchemaVersion: 3,
      files: [
        {
          content: Buffer.from('{"name":"instance"}\n'),
          path: "package.json",
        },
        {
          content: Buffer.from(`${JSON.stringify(manifest)}\n`),
          path: "distribution-manifest.json",
        },
      ],
      treeSha256: manifest.treeSha256,
      whiteLabelVersion: "0.1.0",
    });
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("refuses an unexpected private file even when the listed file checksums match", async () => {
  const { root } = await createArtifact();
  try {
    await mkdir(path.join(root, "control-plane"));
    await writeFile(path.join(root, "control-plane", "worker.mjs"), "export {};\n");
    await assert.rejects(
      readDistributionArtifact(root),
      /distribution artifact has unexpected files/u,
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("accepts the safe dotfiles and dynamic-route filenames in a real distribution", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "wlbp-release-artifact-"));
  const files = [
    { content: Buffer.from("engine-strict=true\n"), path: ".npmrc" },
    {
      content: Buffer.from("export default function Page() {}\n"),
      path: "apps/client/app/[locale]/page.tsx",
    },
  ];
  const manifestFiles = files.map((file) => ({
    bytes: file.content.length,
    path: file.path,
    sha256: digest(file.content),
  }));
  const treeSha256 = digest(
    manifestFiles.map((entry) => `${entry.path}:${entry.sha256}\n`).join(""),
  );
  try {
    for (const file of files) {
      const destination = path.join(root, file.path);
      await mkdir(path.dirname(destination), { recursive: true });
      await writeFile(destination, file.content);
    }
    await writeFile(
      path.join(root, "distribution-manifest.json"),
      JSON.stringify({
        backendContract: { max: 1, min: 1 },
        configSchemaVersion: 3,
        fileCount: manifestFiles.length,
        files: manifestFiles,
        members: ["apps/client"],
        schemaVersion: 1,
        treeSha256,
        whiteLabelVersion: "0.1.0",
      }),
    );

    const artifact = await readDistributionArtifact(root);
    assert.equal(artifact.files.length, 3);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});
