// The composition root the github provisioning worker never had.
//
// Everything under this directory was a tested library with nothing to run it,
// so a provisioning run stopped at seed_repository no matter how healthy the
// database was. This is the shell: secrets, HTTP, the filesystem, and the ports
// that join them to logic that stays free of all three.
//
// It runs where a checkout exists, not on the Edge. read_distribution_artifact
// reads the release off disk, which an Edge Function has no way to provide.
import path from "node:path";

import { createGitHubAppClient } from "./github-app-client.mjs";
import { createSupabaseProvisioningStore } from "./provisioning-store.mjs";
import { createGitHubProvisioningWorker } from "./provisioning-worker.mjs";
import { readDistributionArtifact } from "./release-artifact.mjs";
import { readFile } from "node:fs/promises";

function required(name) {
  const value = process.env[name];
  if (!value || value.trim() === "") throw new Error(`missing_env:${name}`);
  return value;
}

/**
 * The store wants a supabase-js shaped `.rpc`, but pulling the SDK in for one
 * POST would be a dependency to hold a fetch call. api_v1 is the only exposed
 * schema, so an unqualified rpc path already resolves there.
 */
function createRestClient({ serviceRoleKey, url }) {
  return {
    async rpc(name, args) {
      const response = await fetch(`${url}/rest/v1/rpc/${name}`, {
        body: JSON.stringify(args ?? {}),
        headers: {
          apikey: serviceRoleKey,
          authorization: `Bearer ${serviceRoleKey}`,
          "content-type": "application/json",
        },
        method: "POST",
      });
      if (!response.ok) {
        return { data: null, error: new Error(`rpc_failed:${response.status}`) };
      }
      return { data: await response.json(), error: null };
    },
  };
}

/**
 * The instance manifest is the template with this tenant's identity and the
 * platform contract filled in. The remaining files are copied verbatim: a
 * tenant's brand and content are edited in their own repository afterwards,
 * and seeding them from here with anything other than the template would
 * silently become the place those defaults live.
 */
async function loadConfiguration(step, { codeowners, contract, templateRoot }) {
  const read = (relative) => readFile(path.join(templateRoot, relative));
  const template = JSON.parse(await read("manifest.template.json"));
  const request = step.request ?? {};
  const manifest = {
    ...template,
    backendContract: contract.backendContract,
    configSchemaVersion: contract.configSchemaVersion,
    defaultLocale: request.default_locale ?? template.defaultLocale,
    instanceId: step.instanceId,
    tenantId: step.tenantId,
    whiteLabelVersion: contract.whiteLabelVersion,
  };
  const copied = [
    "brand.json",
    "features.json",
    "navigation.json",
    "content/en.json",
    "content/ar.json",
    "theme.css",
  ];
  const files = [
    {
      content: Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`),
      path: "instance/manifest.json",
    },
    // protect_repository refuses to apply the branch ruleset without this, and
    // the ruleset is what makes code owner review mean anything — so the file
    // has to arrive with the configuration, not after it.
    {
      content: Buffer.from(`* ${codeowners}\n`),
      path: ".github/CODEOWNERS",
    },
  ];
  for (const relative of copied) {
    files.push({ content: await read(relative), path: `instance/${relative}` });
  }
  return { defaultBranch: "main", files };
}

export function createWorkerFromEnvironment({ env = process.env, root } = {}) {
  const supabase = createRestClient({
    serviceRoleKey: required("SUPABASE_SERVICE_ROLE_KEY"),
    url: required("SUPABASE_URL"),
  });
  const github = createGitHubAppClient({
    appId: required("GITHUB_APP_ID"),
    installationId: required("GITHUB_APP_INSTALLATION_ID"),
    organization: required("GITHUB_APP_ORGANIZATION"),
    privateKey: required("GITHUB_APP_PRIVATE_KEY"),
  });
  // Stated, never defaulted, and read at startup so a missing owner fails the
  // worker rather than one step: an owner that does not resolve leaves the
  // ruleset in place but makes code owner review unenforceable, which fails
  // open exactly where governance is supposed to fail closed.
  const codeowners = required("GITHUB_INSTANCE_CODEOWNERS");
  const templateRoot = path.join(root, "instance-template/instance");
  const distributionRoot = env.WLBP_DISTRIBUTION_ROOT
    ? path.resolve(env.WLBP_DISTRIBUTION_ROOT)
    : path.join(root, "dist-distribution");

  return createGitHubProvisioningWorker({
    github,
    loadConfiguration: async (step) =>
      loadConfiguration(step, {
        codeowners,
        contract: JSON.parse(
          await readFile(path.join(root, "platform-contract.json"), "utf8"),
        ),
        templateRoot,
      }),
    // The policy is the same for every instance repository, so it is stated
    // here rather than stored per tenant: a per-tenant governance knob is a
    // per-tenant way to weaken it.
    loadGovernance: async () => ({
      defaultBranch: "main",
      requiredChecks: ["instance-ci"],
    }),
    loadRelease: async () => readDistributionArtifact(distributionRoot),
    store: createSupabaseProvisioningStore({ supabase }),
  });
}

/** Drain what is claimable, then stop. The schedule decides when to return. */
export async function drain(worker, { limit = 10 } = {}) {
  const outcomes = [];
  for (let index = 0; index < limit; index += 1) {
    const result = await worker.runOnce();
    outcomes.push(result);
    if (result.kind === "idle") break;
  }
  return outcomes;
}
