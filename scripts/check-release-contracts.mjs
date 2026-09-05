import assert from "node:assert/strict";
import path from "node:path";

import {
  assessReleaseCompatibility,
  buildReleaseManifest,
  validatePlatformContract,
  validateReleaseManifest,
  validateReleaseNotesInput,
} from "../control-plane/contracts/release-contracts.mjs";
import { failCheck, readJson, repositoryRoot } from "./workspace.mjs";

const platformContract = await readJson(
  path.join(repositoryRoot, "platform-contract.json"),
);
const compatibleInput = await readJson(
  path.join(repositoryRoot, "tests/fixtures/contracts/compatible-release-input.json"),
);
const incompatibleInput = await readJson(
  path.join(repositoryRoot, "tests/fixtures/contracts/incompatible-backend-input.json"),
);

const errors = validatePlatformContract(platformContract).map(
  (error) => `platform-contract.json: ${error}`,
);

try {
  const manifest = buildReleaseManifest({
    platformContract,
    ...compatibleInput,
  });

  assert.deepEqual(validateReleaseManifest(manifest), []);
  assert.deepEqual(
    validateReleaseNotesInput({
      featureNotes: compatibleInput.featureNotes,
      upgradeNotes: compatibleInput.upgradeNotes,
      migrationDependencies: {
        "20260905000100_environment_foundation": [],
        "20260905000200_release_metadata": ["20260905000100_environment_foundation"],
      },
    }),
    [],
  );
  assert.match(
    validateReleaseNotesInput({
      featureNotes: compatibleInput.featureNotes,
      upgradeNotes: compatibleInput.upgradeNotes,
      migrationDependencies: {},
      unexpected: true,
    }).join("\n"),
    /unexpected/u,
  );

  const badChecksum = structuredClone(manifest);
  badChecksum.migrations[0].checksum = "sha256:bad";
  assert.match(validateReleaseManifest(badChecksum).join("\n"), /checksum/u);

  const wrongMigrationOrder = structuredClone(manifest);
  wrongMigrationOrder.migrations.reverse();
  assert.match(
    validateReleaseManifest(wrongMigrationOrder).join("\n"),
    /before it appears/u,
  );
  assert.equal(
    manifest.applications.client.commit,
    manifest.applications.dashboard.commit,
  );
  assert.deepEqual(manifest.backendContract, platformContract.backendContract);
  assert.equal(manifest.configSchemaVersion, platformContract.configSchemaVersion);
  assert.equal(manifest.whiteLabelVersion, platformContract.whiteLabelVersion);

  const compatible = assessReleaseCompatibility(
    manifest,
    platformContract.backendContract.min,
  );
  assert.equal(compatible.compatible, true);
  assert.deepEqual(compatible.errors, []);

  assert.equal(incompatibleInput.backendVersionStrategy, "above-current-maximum");
  const incompatible = assessReleaseCompatibility(
    manifest,
    platformContract.backendContract.max + 1,
  );
  assert.equal(incompatible.compatible, false);
  assert.match(incompatible.errors.join("\n"), /outside supported range/u);

  const malformed = {
    ...manifest,
    applications: {
      client: manifest.applications.client,
      dashboard: { commit: "ffffffffffffffffffffffffffffffffffffffff" },
    },
    unexpected: "must fail closed",
  };
  const malformedAssessment = assessReleaseCompatibility(
    malformed,
    platformContract.backendContract.min,
  );
  assert.equal(malformedAssessment.compatible, false);
  assert.match(malformedAssessment.errors.join("\n"), /unexpected/u);
  assert.match(malformedAssessment.errors.join("\n"), /same commit/u);
} catch (error) {
  errors.push(error instanceof Error ? error.message : String(error));
}

const suppliedManifestPath = process.argv[2];
if (suppliedManifestPath) {
  try {
    const suppliedManifest = await readJson(
      path.resolve(repositoryRoot, suppliedManifestPath),
    );
    errors.push(
      ...validateReleaseManifest(suppliedManifest).map(
        (error) => `${suppliedManifestPath}: ${error}`,
      ),
    );

    for (const field of ["whiteLabelVersion", "configSchemaVersion"]) {
      if (suppliedManifest[field] !== platformContract[field]) {
        errors.push(
          `${suppliedManifestPath}: ${field} must be stamped from platform-contract.json`,
        );
      }
    }
    if (
      JSON.stringify(suppliedManifest.backendContract) !==
      JSON.stringify(platformContract.backendContract)
    ) {
      errors.push(
        `${suppliedManifestPath}: backendContract must be stamped from platform-contract.json`,
      );
    }
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }
}

failCheck("release metadata and backend compatibility contracts", errors);
