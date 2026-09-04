import { spawnSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { readJson, repositoryRoot } from "./workspace.mjs";

const outputPath = path.resolve(
  repositoryRoot,
  process.argv[2] ?? ".artifacts/sbom.cdx.json",
);
const inventory = spawnSync(
  "pnpm",
  ["list", "--json", "--depth", "Infinity", "--recursive"],
  { cwd: repositoryRoot, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 },
);

if (inventory.status !== 0) {
  process.stderr.write("Unable to inventory installed dependencies with pnpm.\n");
  process.exit(1);
}

let roots;
try {
  roots = JSON.parse(inventory.stdout);
} catch {
  process.stderr.write("pnpm returned an unreadable dependency inventory.\n");
  process.exit(1);
}

const manifest = await readJson(path.join(repositoryRoot, "package.json"));
const workspaceByPath = new Map(
  roots.map((root) => [
    path.resolve(root.path),
    { name: root.name, version: root.version },
  ]),
);
const components = new Map();
const edges = new Map();

function packageUrl(name, version) {
  if (name.startsWith("@") && name.includes("/")) {
    const [scope, packageName] = name.split("/", 2);
    return `pkg:npm/%40${encodeURIComponent(scope.slice(1))}/${encodeURIComponent(
      packageName,
    )}@${encodeURIComponent(version)}`;
  }
  return `pkg:npm/${encodeURIComponent(name)}@${encodeURIComponent(version)}`;
}

function dependencyIdentity(name, dependency) {
  const workspace = dependency.path
    ? workspaceByPath.get(path.resolve(dependency.path))
    : undefined;
  if (workspace) return workspace;
  if (
    typeof dependency.version !== "string" ||
    dependency.version.startsWith("link:")
  ) {
    return undefined;
  }
  return { name, version: dependency.version };
}

function addComponent(name, version, type = "library") {
  const reference = packageUrl(name, version);
  if (!components.has(reference)) {
    components.set(reference, {
      type,
      name,
      version,
      "bom-ref": reference,
      purl: reference,
    });
  }
  if (!edges.has(reference)) edges.set(reference, new Set());
  return reference;
}

function visitDependencies(parentReference, container) {
  for (const field of [
    "dependencies",
    "devDependencies",
    "optionalDependencies",
    "peerDependencies",
  ]) {
    for (const [name, dependency] of Object.entries(container[field] ?? {})) {
      const identity = dependencyIdentity(name, dependency);
      if (!identity) continue;
      const childReference = addComponent(identity.name, identity.version);
      edges.get(parentReference).add(childReference);
      visitDependencies(childReference, dependency);
    }
  }
}

for (const root of roots) {
  const workspacePath = path.relative(repositoryRoot, root.path);
  const componentType = workspacePath.startsWith(`packages${path.sep}`)
    ? "library"
    : "application";
  const rootReference = addComponent(root.name, root.version, componentType);
  visitDependencies(rootReference, root);
}

const rootReference = packageUrl(manifest.name, manifest.version);
const bom = {
  bomFormat: "CycloneDX",
  specVersion: "1.6",
  version: 1,
  metadata: {
    component: components.get(rootReference),
    tools: {
      components: [
        {
          type: "application",
          name: "generate-sbom.mjs",
          version: "1",
        },
      ],
    },
  },
  components: [...components.values()]
    .filter((component) => component["bom-ref"] !== rootReference)
    .sort((left, right) => left["bom-ref"].localeCompare(right["bom-ref"])),
  dependencies: [...edges.entries()]
    .map(([reference, dependencies]) => ({
      ref: reference,
      dependsOn: [...dependencies].sort(),
    }))
    .sort((left, right) => left.ref.localeCompare(right.ref)),
};

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(bom, null, 2)}\n`, "utf8");
process.stdout.write(
  `Wrote CycloneDX ${bom.specVersion} SBOM with ${components.size} components to ${path.relative(
    repositoryRoot,
    outputPath,
  )}.\n`,
);
