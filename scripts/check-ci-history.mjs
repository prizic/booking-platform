import { spawnSync } from "node:child_process";

import { failCheck, repositoryRoot } from "./workspace.mjs";

const errors = [];
const revisions = spawnSync("git", ["rev-list", "--all"], {
  cwd: repositoryRoot,
  encoding: "utf8",
});

if (revisions.status !== 0) {
  errors.push("unable to enumerate Git history for the secret scan");
} else {
  const commits = revisions.stdout.trim().split(/\s+/u).filter(Boolean);
  const secretPattern = [
    "-----BEGIN (EC |OPENSSH |RSA )?PRIVATE KEY-----",
    "gh[opusr]_[A-Za-z0-9]{30,}",
    "github_pat_[A-Za-z0-9_]{40,}",
    "sk_live_[A-Za-z0-9]{20,}",
    "AKIA[0-9A-Z]{16}",
    "AIza[0-9A-Za-z_-]{35}",
  ].join("|");

  for (let offset = 0; offset < commits.length; offset += 100) {
    const batch = commits.slice(offset, offset + 100);
    const scan = spawnSync(
      "git",
      ["grep", "-I", "-l", "-E", "-e", secretPattern, ...batch],
      { cwd: repositoryRoot, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
    );

    if (scan.status === 0) {
      for (const hit of scan.stdout.trim().split("\n").filter(Boolean)) {
        errors.push(`secret-shaped value in Git object ${hit}`);
      }
    } else if (scan.status !== 1) {
      errors.push("Git history secret scan failed before it could complete");
      break;
    }
  }
}

failCheck("Git history contains no high-confidence secret shapes", errors);
