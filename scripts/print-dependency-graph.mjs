import { discoverWorkspaceMembers, workspaceEdges } from "./workspace.mjs";

const members = await discoverWorkspaceMembers();
const edges = workspaceEdges(members);
const requestedFormat = process.argv.find((argument) =>
  argument.startsWith("--format="),
);
const format = requestedFormat?.slice("--format=".length) ?? "text";

if (format === "json") {
  process.stdout.write(
    `${JSON.stringify(
      {
        edges: edges.map((edge) => ({
          field: edge.field,
          from: edge.from.path,
          to: edge.to.path,
        })),
        members: members.map((member) => ({
          distribution: member.distribution,
          name: member.name,
          path: member.path,
        })),
      },
      null,
      2,
    )}\n`,
  );
} else if (format === "mermaid") {
  process.stdout.write("flowchart LR\n");
  for (const member of members) {
    const id = member.path.replaceAll(/[^a-zA-Z0-9]/gu, "_");
    process.stdout.write(
      `  ${id}["${member.path} (${member.distribution ?? "unclassified"})"]\n`,
    );
  }
  for (const edge of edges) {
    const from = edge.from.path.replaceAll(/[^a-zA-Z0-9]/gu, "_");
    const to = edge.to.path.replaceAll(/[^a-zA-Z0-9]/gu, "_");
    process.stdout.write(`  ${from} -->|${edge.field}| ${to}\n`);
  }
} else if (format === "text") {
  for (const member of members) {
    process.stdout.write(`${member.path} [${member.distribution ?? "unclassified"}]\n`);
    const targets = edges.filter((edge) => edge.from.path === member.path);
    if (targets.length === 0) process.stdout.write("  (no workspace dependencies)\n");
    for (const edge of targets) {
      process.stdout.write(`  -> ${edge.to.path} (${edge.field})\n`);
    }
  }
} else {
  process.stderr.write(
    `Unknown format ${JSON.stringify(format)}; use text, json, or mermaid\n`,
  );
  process.exitCode = 1;
}
