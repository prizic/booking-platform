import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  allDeclaredDependencies,
  discoverWorkspaceMembers,
  expectedDistribution,
  expectedPackageDistribution,
  extractImportSpecifiers,
  failCheck,
  pathExists,
  repositoryRoot,
  walkFiles,
  workspaceEdges,
} from "./workspace.mjs";

const errors = [];
const members = await discoverWorkspaceMembers();
const byName = new Map(members.map((member) => [member.name, member]));
const byPath = new Map(members.map((member) => [member.path, member]));
const hasSourceTemplate = await pathExists(
  path.join(repositoryRoot, "instance-template"),
);
const hasGeneratedInstance = await pathExists(path.join(repositoryRoot, "instance"));
let repositoryMode;

if (hasSourceTemplate && hasGeneratedInstance) {
  errors.push(
    "repository mode is ambiguous: source instance-template/ and generated instance/ cannot coexist",
  );
} else if (hasSourceTemplate) {
  repositoryMode = "source-monorepo";
} else if (hasGeneratedInstance) {
  repositoryMode = "generated-instance";
} else {
  errors.push(
    "repository mode is unknown: expected source instance-template/ or generated instance/",
  );
}

for (const [memberPath, expected] of expectedDistribution) {
  if (repositoryMode === "generated-instance" && expected !== "distributed") {
    continue;
  }
  const member = byPath.get(memberPath);
  if (!member) {
    errors.push(
      repositoryMode === "generated-instance"
        ? `ADR-0011 distributed workspace member is missing: ${memberPath}`
        : `ADR-0011 workspace member is missing: ${memberPath}`,
    );
    continue;
  }
  if (member.distribution !== expected) {
    errors.push(
      `${memberPath} must declare wlbp.distribution=${JSON.stringify(expected)}`,
    );
  }
}

for (const member of members) {
  const expected = expectedDistribution.get(member.path);
  if (expected === undefined) {
    errors.push(
      `${member.path} is not classified by ADR-0011; a superseding ADR is required`,
    );
  } else if (repositoryMode === "generated-instance" && expected !== "distributed") {
    errors.push(
      `generated instance must not contain ADR-0011 platform-only member ${member.path}`,
    );
  }
  if (!member.manifest.private) {
    errors.push(`${member.path} must set private=true until publishing is designed`);
  }
  const expectedByName = expectedPackageDistribution.get(member.name);
  if (expectedByName === undefined) {
    errors.push(
      `${member.path} package name ${member.name} is not classified by ADR-0011`,
    );
  } else if (expected !== undefined && expectedByName !== expected) {
    errors.push(
      `${member.path} package name ${member.name} has conflicting ADR-0011 classifications`,
    );
  }
}

const edges = workspaceEdges(members);
for (const edge of edges) {
  if (edge.from.path.startsWith("packages/") && edge.to.path.startsWith("apps/")) {
    errors.push(`${edge.from.path} may not depend on application ${edge.to.path}`);
  }
  if (edge.from.path.startsWith("apps/") && edge.to.path.startsWith("apps/")) {
    errors.push(`${edge.from.path} may not depend on application ${edge.to.path}`);
  }
  if (
    edge.from.distribution === "distributed" &&
    edge.to.distribution !== "distributed"
  ) {
    errors.push(
      `${edge.from.path} (${edge.field}) reaches platform-only ${edge.to.path}`,
    );
  }
}

const adjacency = new Map(members.map((member) => [member.path, []]));
for (const edge of edges) adjacency.get(edge.from.path)?.push(edge.to.path);
const active = new Set();
const visited = new Set();
const trail = [];

function visit(memberPath) {
  if (active.has(memberPath)) {
    const cycleStart = trail.indexOf(memberPath);
    errors.push(
      `workspace manifest cycle: ${[...trail.slice(cycleStart), memberPath].join(" -> ")}`,
    );
    return;
  }
  if (visited.has(memberPath)) return;

  active.add(memberPath);
  trail.push(memberPath);
  for (const target of adjacency.get(memberPath) ?? []) visit(target);
  trail.pop();
  active.delete(memberPath);
  visited.add(memberPath);
}

for (const member of members) visit(member.path);

const bookingDomain = byPath.get("packages/booking-domain");
if (bookingDomain) {
  const forbidden =
    /^(?:@supabase\/|next(?:\/|$)|react(?:-dom)?(?:\/|$)|server-only$)/u;
  for (const dependency of allDeclaredDependencies(bookingDomain)) {
    if (forbidden.test(dependency.name)) {
      errors.push(
        `booking-domain ${dependency.field} must not include ${dependency.name}`,
      );
    }
  }
}

const providerDependency =
  /^(?:@google-cloud\/|@googleapis\/|@microsoft\/|@octokit\/|@resend\/|@stripe\/|@vercel\/|google-auth-library(?:\/|$)|googleapis(?:\/|$)|microsoft-graph(?:\/|$)|octokit(?:\/|$)|resend(?:\/|$)|stripe(?:\/|$)|vercel(?:\/|$))/u;

function isPackageImport(specifier, packageName) {
  return specifier === packageName || specifier.startsWith(`${packageName}/`);
}
for (const member of members) {
  for (const dependency of allDeclaredDependencies(member)) {
    if (
      member.distribution === "distributed" &&
      expectedPackageDistribution.get(dependency.name) === "platform-only" &&
      !byName.has(dependency.name)
    ) {
      errors.push(
        `${member.path} ${dependency.field} reaches absent platform-only package ${dependency.name}`,
      );
    }
    if (
      dependency.name.startsWith("@supabase/") &&
      member.path !== "packages/supabase-client" &&
      member.path !== "packages/supabase-admin"
    ) {
      errors.push(
        `${member.path} may not declare ${dependency.name}; use a Supabase client package`,
      );
    }
    if (
      providerDependency.test(dependency.name) &&
      member.path !== "packages/email" &&
      member.path !== "packages/integrations"
    ) {
      errors.push(
        `${member.path} may not declare provider SDK ${dependency.name}; use a platform adapter`,
      );
    }
    if (
      isPackageImport(dependency.name, "@wlbp/supabase-client") &&
      member.path !== "apps/client" &&
      member.path !== "apps/dashboard" &&
      member.path !== "apps/platform-admin"
    ) {
      errors.push(`${member.path} may not depend on @wlbp/supabase-client`);
    }
    if (
      isPackageImport(dependency.name, "@wlbp/supabase-admin") &&
      member.path !== "apps/platform-admin"
    ) {
      errors.push(`${member.path} may not depend on @wlbp/supabase-admin`);
    }
  }
}

const sourceFiles = await walkFiles(repositoryRoot, {
  include: (filePath) => /\.(?:[cm]?[jt]sx?)$/u.test(filePath),
});

function ownerOf(filePath) {
  const normalized = path.relative(repositoryRoot, filePath).split(path.sep).join("/");
  return members.find(
    (member) => normalized === member.path || normalized.startsWith(`${member.path}/`),
  );
}

for (const filePath of sourceFiles) {
  const owner = ownerOf(filePath);
  const source = await readFile(filePath, "utf8");
  const relativeFile = path
    .relative(repositoryRoot, filePath)
    .split(path.sep)
    .join("/");
  if (!owner) {
    for (const specifier of extractImportSpecifiers(source)) {
      if (specifier.startsWith("@supabase/")) {
        errors.push(
          `${relativeFile} imports ${specifier}; vendor Supabase clients are constructed only in the two owned client packages`,
        );
      }
      if (providerDependency.test(specifier)) {
        errors.push(
          `${relativeFile} imports provider SDK ${specifier}; use an owned platform adapter package`,
        );
      }
    }
    continue;
  }

  const isClientModule = /^\s*["']use client["'];/u.test(source);
  const isSupabaseServerEntry =
    relativeFile === "packages/supabase-client/src/server.ts";

  for (const specifier of extractImportSpecifiers(source)) {
    for (const [packageName, distribution] of expectedPackageDistribution) {
      if (
        distribution === "platform-only" &&
        owner.distribution === "distributed" &&
        !byName.has(packageName) &&
        isPackageImport(specifier, packageName)
      ) {
        errors.push(
          `${relativeFile} imports absent platform-only package ${packageName}`,
        );
      }
    }

    if (
      specifier.startsWith("@supabase/") &&
      owner.path !== "packages/supabase-client" &&
      owner.path !== "packages/supabase-admin"
    ) {
      errors.push(`${relativeFile} imports forbidden Supabase SDK ${specifier}`);
    }

    if (
      providerDependency.test(specifier) &&
      owner.path !== "packages/email" &&
      owner.path !== "packages/integrations"
    ) {
      errors.push(
        `${relativeFile} imports provider SDK ${specifier}; provider SDKs belong in email or integrations adapters`,
      );
    }

    if (
      owner.distribution === "distributed" &&
      ((specifier === "server-only" && !isSupabaseServerEntry) ||
        specifier.includes("supabase-admin"))
    ) {
      errors.push(`${relativeFile} imports platform-only module ${specifier}`);
    }

    if (
      isClientModule &&
      (specifier === "server-only" || specifier === "@wlbp/supabase-client/server")
    ) {
      errors.push(
        `${relativeFile} is a Client Module importing server-only ${specifier}`,
      );
    }

    if (
      isPackageImport(specifier, "@wlbp/supabase-client") &&
      owner.path !== "apps/client" &&
      owner.path !== "apps/dashboard" &&
      owner.path !== "apps/platform-admin" &&
      owner.path !== "packages/supabase-client"
    ) {
      errors.push(`${relativeFile} may not import @wlbp/supabase-client`);
    }
    if (
      isPackageImport(specifier, "@wlbp/supabase-admin") &&
      owner.path !== "apps/platform-admin"
    ) {
      errors.push(`${relativeFile} may not import @wlbp/supabase-admin`);
    }

    for (const [packageName, target] of byName) {
      if (specifier.startsWith(`${packageName}/`)) {
        const publicSubpath = `.${specifier.slice(packageName.length)}`;
        const declaredExports = target.manifest.exports;
        if (
          declaredExports === null ||
          typeof declaredExports !== "object" ||
          !Object.hasOwn(declaredExports, publicSubpath)
        ) {
          errors.push(
            `${relativeFile} deep-imports ${specifier}; use a declared public package export`,
          );
        }
      }
      if (
        isPackageImport(specifier, packageName) &&
        owner.distribution === "distributed" &&
        target.distribution !== "distributed"
      ) {
        errors.push(`${relativeFile} imports platform-only package ${packageName}`);
      }
    }

    if (specifier.startsWith(".")) {
      const resolved = path.resolve(path.dirname(filePath), specifier);
      const targetOwner = ownerOf(resolved);
      if (targetOwner && targetOwner.path !== owner.path) {
        errors.push(
          `${relativeFile} crosses into ${targetOwner.path} by relative import ${specifier}`,
        );
      }
      if (
        /(?:^|\/)(?:__tests__|internal|lib|tests?)(?:\/|$)/u.test(
          path.relative(repositoryRoot, resolved).split(path.sep).join("/"),
        ) &&
        /(?:^|\/)(?:__tests__\/|tests?\/|[^/]+\.(?:test|spec)\.[cm]?[jt]sx?$)/u.test(
          relativeFile,
        )
      ) {
        errors.push(
          `${relativeFile} imports private implementation ${specifier}; tests must use the public entry point`,
        );
      }
    }
  }
}

failCheck("workspace boundaries", [...new Set(errors)].sort());
