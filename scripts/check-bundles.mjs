import { readFile, stat } from "node:fs/promises";
import path from "node:path";

import { failCheck, pathExists, repositoryRoot, walkFiles } from "./workspace.mjs";

const errors = [];
const forbidden = [
  ["platform-only Supabase package", /@wlbp\/supabase-admin|supabase-admin\/dist/iu],
  ["Platform Admin source", /apps[\\/]platform-admin/iu],
  ["control-plane source", /control-plane[\\/]/iu],
  ["privileged Supabase environment name", /SUPABASE_(?:SERVICE_ROLE|SECRET)_KEY/iu],
  ["Stripe server credential name", /STRIPE_(?:SECRET|RESTRICTED)_KEY/iu],
  ["email provider credential name", /RESEND_API_KEY/iu],
  ["GitHub credential name", /GITHUB_(?:APP_PRIVATE_KEY|TOKEN)/iu],
  ["Vercel credential name", /VERCEL_API_TOKEN/iu],
  [
    "private provider SDK",
    /node_modules[\\/](?:@googleapis|@microsoft|@octokit|@resend|@stripe|@vercel|googleapis|microsoft-graph|octokit|resend|stripe|vercel)[\\/]/iu,
  ],
];

for (const app of ["client", "dashboard"]) {
  const buildPath = path.join(repositoryRoot, "apps", app, ".next");
  const buildIdPath = path.join(buildPath, "BUILD_ID");
  if (!(await pathExists(buildIdPath))) {
    errors.push(`apps/${app} has no production .next/BUILD_ID; run pnpm build first`);
    continue;
  }

  const files = await walkFiles(buildPath);
  for (const filePath of files) {
    const details = await stat(filePath);
    if (details.size > 10_000_000) continue;
    const buffer = await readFile(filePath);
    if (buffer.includes(0)) continue;
    const source = buffer.toString("utf8");
    for (const [label, pattern] of forbidden) {
      if (pattern.test(source)) {
        errors.push(
          `apps/${app} production bundle contains ${label} in ${path
            .relative(repositoryRoot, filePath)
            .split(path.sep)
            .join("/")}`,
        );
      }
    }
  }
}

failCheck(
  "distributed production bundles contain no private code or credentials",
  errors,
);
