import { readFile } from "node:fs/promises";
import path from "node:path";

import { failCheck, pathExists, repositoryRoot, walkFiles } from "./workspace.mjs";

const errors = [];
const workflowDirectory = path.join(repositoryRoot, ".github", "workflows");
const requiredWorkflows = new Map([
  [
    "ci.yml",
    [
      "pull_request:",
      "pnpm install --frozen-lockfile",
      "pnpm db:reset",
      "NEXT_PUBLIC_SITE_URL",
    ],
  ],
  [
    "instance-ci.yml",
    [
      "workflow_call:",
      "backend_contract_version",
      "pnpm install --frozen-lockfile",
      "pnpm --filter @wlbp/testing exec playwright install --with-deps chromium",
      "pnpm --filter @wlbp/testing test:instance",
      "NEXT_PUBLIC_SITE_URL",
    ],
  ],
  [
    "backend-release.yml",
    [
      "workflow_dispatch:",
      "environment:",
      "expected_environment_fingerprint",
      "ENVIRONMENT_FINGERPRINT",
      "createHash",
      "supabaseProjectRef",
      "stored !== computed",
      "RECOVERY_EVIDENCE_ID",
      "RECOVERY_VERIFIED_AT",
      "age <= 24 * 60 * 60 * 1000",
      "supabase db push",
      "cancel-in-progress: false",
      "Unchecksummed Edge Function",
      "NEXT_PUBLIC_SITE_URL",
    ],
  ],
  [
    "fast-feedback.yml",
    [
      "pull_request:",
      "pnpm install --frozen-lockfile --prefer-offline",
      "pnpm check:fast",
      "TURBO_TELEMETRY_DISABLED",
    ],
  ],
]);

for (const [fileName, requiredFragments] of requiredWorkflows) {
  const filePath = path.join(workflowDirectory, fileName);
  if (!(await pathExists(filePath))) {
    errors.push(`missing required workflow .github/workflows/${fileName}`);
    continue;
  }
  const source = await readFile(filePath, "utf8");
  for (const fragment of requiredFragments) {
    if (!source.includes(fragment)) {
      errors.push(`${fileName} is missing required control: ${fragment}`);
    }
  }
}

const workflowFiles = await walkFiles(workflowDirectory, {
  include: (filePath) => /\.ya?ml$/u.test(filePath),
});
for (const filePath of workflowFiles) {
  const source = await readFile(filePath, "utf8");
  const relative = path.relative(repositoryRoot, filePath).split(path.sep).join("/");
  if (/^\s*run:\s+[^|>]\S*.*#/mu.test(source)) {
    errors.push(
      `${relative} has an inline run command containing #; use a block scalar so YAML cannot truncate the shell command`,
    );
  }
  for (const match of source.matchAll(/^\s*-?\s*uses:\s*([^\s#]+)(?:\s+#.*)?$/gmu)) {
    const reference = match[1];
    if (reference.startsWith("./")) continue;
    const separator = reference.lastIndexOf("@");
    const revision = separator === -1 ? "" : reference.slice(separator + 1);
    if (!/^[0-9a-f]{40}$/u.test(revision)) {
      errors.push(
        `${relative} uses an action without a full immutable SHA: ${reference}`,
      );
    }
  }
}

for (const fileName of ["ci.yml", "instance-ci.yml"]) {
  const filePath = path.join(workflowDirectory, fileName);
  if (!(await pathExists(filePath))) continue;
  const source = await readFile(filePath, "utf8");
  if (/\$\{\{\s*secrets\./u.test(source)) {
    errors.push(`${fileName} must remain credential-free`);
  }
  if (/supabase\s+(?:db\s+push|migration\s+(?:repair|squash))/u.test(source)) {
    errors.push(`${fileName} must never mutate a hosted Supabase project`);
  }
}

const releasePath = path.join(workflowDirectory, "backend-release.yml");
if (await pathExists(releasePath)) {
  const source = await readFile(releasePath, "utf8");
  const orderedReleaseControls = [
    "Validate protected-environment references",
    "Require fresh independent recovery evidence for production",
    "Refuse unchecksummed Edge Function deployment",
    "Link the selected hosted project",
    "Preview pending central migrations",
    "Apply pending central migrations",
  ];
  let previousPosition = -1;
  for (const control of orderedReleaseControls) {
    const position = source.indexOf(control);
    if (position === -1 || position <= previousPosition) {
      errors.push(
        `backend-release.yml must keep the fail-closed release controls in order; misplaced: ${control}`,
      );
    }
    previousPosition = position;
  }

  const destructivePatterns = [
    /db\s+reset/u,
    /migration\s+(?:down|repair|squash)/u,
    /DROP\s+(?:DATABASE|SCHEMA)/iu,
    /TRUNCATE\s+/iu,
  ];
  for (const pattern of destructivePatterns) {
    if (pattern.test(source)) {
      errors.push(
        `backend-release.yml contains forbidden destructive operation ${pattern}`,
      );
    }
  }
}

failCheck("GitHub Actions controls", errors.sort());
