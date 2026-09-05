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
    // The Playwright web servers use `next dev` and leave a `.next/dev`
    // directory behind. It is a development server cache, not a production
    // bundle, and may contain dependency documentation examples.
    const relativePath = path.relative(buildPath, filePath);
    if (relativePath.split(path.sep).includes("dev")) continue;

    // Next.js emits server source maps even when browser source maps are
    // disabled. They contain dependency comments and source text (including
    // documentation examples such as SUPABASE_SECRET_KEY), but are not
    // executable production bundles. Scan executable/static assets below;
    // distribution closure and secret-shape checks cover source inputs.
    if (filePath.endsWith(".map")) continue;
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
