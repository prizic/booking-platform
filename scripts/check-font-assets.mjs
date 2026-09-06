import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

import { failCheck, repositoryRoot } from "./workspace.mjs";

const errors = [];
const provenancePath = path.join(repositoryRoot, "docs/fonts/provenance.json");
let provenance;
try {
  provenance = JSON.parse(await readFile(provenancePath, "utf8"));
} catch {
  errors.push("docs/fonts/provenance.json is missing or invalid JSON");
}

const distributions = [
  "apps/client/public/fonts",
  "apps/dashboard/public/fonts",
  "instance-template/instance/assets/fonts",
];
const expectedLicenses = [
  "OFL-Inter.txt",
  "OFL-Noto-Sans-Arabic.txt",
  "OFL-Noto-Naskh-Arabic.txt",
];

if (provenance && Array.isArray(provenance.fonts)) {
  for (const font of provenance.fonts) {
    if (
      typeof font.asset !== "string" ||
      !/^[A-Za-z0-9][A-Za-z0-9.-]+\.woff2$/u.test(font.asset) ||
      !/^[0-9a-f]{64}$/u.test(font.sha256)
    ) {
      errors.push("font provenance entries must contain a safe asset and SHA-256");
      continue;
    }
    for (const distribution of distributions) {
      const assetPath = path.join(repositoryRoot, distribution, font.asset);
      const bytes = await readFile(assetPath).catch(() => undefined);
      if (!bytes) {
        errors.push(`${distribution}/${font.asset} is missing`);
      } else if (createHash("sha256").update(bytes).digest("hex") !== font.sha256) {
        errors.push(`${distribution}/${font.asset} does not match recorded SHA-256`);
      }
    }
  }
} else {
  errors.push("font provenance must contain a fonts array");
}

for (const distribution of distributions) {
  for (const license of expectedLicenses) {
    const licensePath = path.join(repositoryRoot, distribution, license);
    if (!(await stat(licensePath).catch(() => undefined))) {
      errors.push(`${distribution}/${license} is missing`);
    }
  }
}

for (const app of ["client", "dashboard"]) {
  const css = await readFile(
    path.join(repositoryRoot, `apps/${app}/app/globals.css`),
    "utf8",
  );
  if (/https?:\/\//u.test(css) || /url\(\s*['"]?\/\//u.test(css)) {
    errors.push(`apps/${app}/app/globals.css contains a remote font/resource URL`);
  }
  if ((css.match(/@font-face\s*\{/gu) ?? []).length !== 3) {
    errors.push(`apps/${app}/app/globals.css must declare exactly three local faces`);
  }
}

failCheck("pinned local font assets and provenance", errors.sort());
