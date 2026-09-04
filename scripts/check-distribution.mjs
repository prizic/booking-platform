import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  discoverWorkspaceMembers,
  expectedDistribution,
  failCheck,
  repositoryRoot,
  walkFiles,
  workspaceEdges,
} from "./workspace.mjs";

const errors = [];
const members = await discoverWorkspaceMembers();
const byPath = new Map(members.map((member) => [member.path, member]));
const outgoing = new Map(members.map((member) => [member.path, []]));

for (const edge of workspaceEdges(members)) {
  outgoing.get(edge.from.path)?.push(edge.to);
}

const roots = ["apps/client", "apps/dashboard"];
const closure = new Set();
const pending = [...roots];

while (pending.length > 0) {
  const memberPath = pending.pop();
  if (!memberPath || closure.has(memberPath)) continue;

  const member = byPath.get(memberPath);
  if (!member) {
    errors.push(`distribution root is missing: ${memberPath}`);
    continue;
  }

  closure.add(memberPath);
  if (member.distribution !== "distributed") {
    errors.push(`dependency closure includes non-distributed member ${memberPath}`);
  }

  for (const target of outgoing.get(memberPath) ?? []) pending.push(target.path);
}

for (const member of members) {
  const expected = expectedDistribution.get(member.path);
  if (!expected) {
    errors.push(`${member.path} is absent from the ADR-0011 allowlist`);
  } else if (member.distribution !== expected) {
    errors.push(
      `${member.path} is ${member.distribution ?? "unclassified"}, expected ${expected}`,
    );
  }
}
for (const memberPath of expectedDistribution.keys()) {
  if (!byPath.has(memberPath)) {
    errors.push(`ADR-0011 workspace member is missing: ${memberPath}`);
  }
}

const forbiddenPathSegments = [
  "/migrations/",
  "/platform-admin/",
  "/supabase-admin/",
  "/control-plane/",
];
const forbiddenContent = [
  /@wlbp\/supabase-admin/u,
  /apps\/platform-admin/u,
  /control-plane\//u,
  /SUPABASE_SERVICE_ROLE_KEY/u,
  /SUPABASE_SECRET_KEY/u,
];

for (const memberPath of closure) {
  const absoluteMemberPath = path.join(repositoryRoot, memberPath);
  const files = await walkFiles(absoluteMemberPath);
  for (const filePath of files) {
    const normalized = `/${path.relative(repositoryRoot, filePath).split(path.sep).join("/")}`;
    if (forbiddenPathSegments.some((segment) => normalized.includes(segment))) {
      errors.push(
        `forbidden private path in distribution closure: ${normalized.slice(1)}`,
      );
      continue;
    }

    if (!/\.(?:json|[cm]?[jt]sx?)$/u.test(filePath)) continue;
    const source = await readFile(filePath, "utf8");
    for (const pattern of forbiddenContent) {
      if (pattern.test(source)) {
        errors.push(
          `private symbol ${pattern} appears in distributed file ${normalized.slice(1)}`,
        );
      }
    }
  }
}

if (errors.length === 0) {
  process.stdout.write("Distribution dependency closure:\n");
  for (const memberPath of [...closure].sort()) {
    process.stdout.write(`  - ${memberPath}\n`);
  }
}

failCheck("ADR-0011 distribution allowlist and closure", [...new Set(errors)].sort());
