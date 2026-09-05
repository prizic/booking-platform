import { readFile, stat } from "node:fs/promises";
import path from "node:path";

import { failCheck, repositoryRoot, walkFiles } from "./workspace.mjs";

const errors = [];
const scannerPath = path.join(repositoryRoot, "scripts", "check-secret-shapes.mjs");
const excludedTopLevel = new Set([".git", "docs"]);
const allowedTextExtensions = new Set([
  ".cjs",
  ".css",
  ".env",
  ".example",
  ".js",
  ".json",
  ".jsx",
  ".mjs",
  ".ts",
  ".tsx",
  ".yaml",
  ".yml",
]);

const unmistakableSecretShapes = [
  ["private key", /-----BEGIN (?:EC |OPENSSH |RSA )?PRIVATE KEY-----/u],
  ["GitHub token", /\b(?:gh[opusr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})\b/u],
  ["live Stripe secret", /\bsk_live_[A-Za-z0-9]{20,}\b/u],
  ["AWS access key", /\bAKIA[0-9A-Z]{16}\b/u],
  ["Google API key", /\bAIza[0-9A-Za-z_-]{35}\b/u],
];

function isSafeExampleValue(rawValue) {
  const value = rawValue
    .trim()
    .replace(/^(["'])(.*)\1$/u, "$2")
    .trim();
  return (
    value === "" ||
    value === "null" ||
    value === "undefined" ||
    /^\$\{[^}]+\}$/u.test(value) ||
    /^<[^>]+>$/u.test(value) ||
    /^(?:change-me|example|replace-me|set-in-your-own-env)$/iu.test(value)
  );
}

const files = await walkFiles(repositoryRoot, {
  include: (filePath) => {
    if (filePath === scannerPath) return false;
    const relative = path.relative(repositoryRoot, filePath);
    const topLevel = relative.split(path.sep)[0];
    if (excludedTopLevel.has(topLevel)) return false;
    if (relative.startsWith(`supabase${path.sep}.temp${path.sep}`)) return false;
    if (
      relative === "AGENTS.md" ||
      relative === "WHITE_LABEL_BOOKING_PLATFORM_PRODUCT_ARCHITECTURE.md"
    ) {
      return false;
    }
    const extension = path.extname(filePath);
    return (
      allowedTextExtensions.has(extension) || path.basename(filePath).startsWith(".env")
    );
  },
});

for (const filePath of files) {
  const details = await stat(filePath);
  if (details.size > 2_000_000) continue;
  const source = await readFile(filePath, "utf8");
  const relative = path.relative(repositoryRoot, filePath).split(path.sep).join("/");

  for (const [label, pattern] of unmistakableSecretShapes) {
    if (pattern.test(source)) errors.push(`${relative} contains a ${label} shape`);
  }

  const environmentAssignment =
    /(?:^|\n)\s*(?:export\s+)?([A-Z][A-Z0-9_]*(?:SECRET|TOKEN|PASSWORD|PRIVATE_KEY|SERVICE_ROLE)[A-Z0-9_]*)\s*=\s*([^#\r\n]*)/gu;
  for (const match of source.matchAll(environmentAssignment)) {
    if (!isSafeExampleValue(match[2] ?? "")) {
      errors.push(`${relative} assigns a non-placeholder value to ${match[1]}`);
    }
  }

  const jsonSecretAssignment =
    /["']([A-Za-z0-9]*(?:Secret(?:Key)?|Password|PrivateKey|ServiceRole(?:Key)?|ApiToken|AccessToken))["']\s*:\s*["']([^"']+)["']/gu;
  for (const match of source.matchAll(jsonSecretAssignment)) {
    if (!isSafeExampleValue(match[2] ?? "")) {
      errors.push(`${relative} assigns a non-placeholder value to ${match[1]}`);
    }
  }
}

failCheck("source tree contains no secret-shaped values", [...new Set(errors)].sort());
