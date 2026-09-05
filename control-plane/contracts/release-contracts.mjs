const semanticVersionPattern = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/u;
const commitPattern = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u;
const migrationIdPattern = /^\d{14}_[a-z0-9]+(?:_[a-z0-9]+)*$/u;
const checksumPattern = /^sha256:[0-9a-f]{64}$/u;

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validateExactKeys(value, expectedKeys, label, errors) {
  if (!isPlainObject(value)) {
    errors.push(`${label} must be an object`);
    return false;
  }

  const actualKeys = Object.keys(value);
  const expected = new Set(expectedKeys);
  const missing = expectedKeys.filter((key) => !actualKeys.includes(key));
  const unexpected = actualKeys.filter((key) => !expected.has(key));

  if (missing.length > 0) {
    errors.push(`${label} is missing key(s): ${missing.sort().join(", ")}`);
  }
  if (unexpected.length > 0) {
    errors.push(`${label} has unexpected key(s): ${unexpected.sort().join(", ")}`);
  }

  return true;
}

function validateBackendContract(value, label, errors) {
  if (!validateExactKeys(value, ["min", "max"], label, errors)) return;

  if (!Number.isInteger(value.min) || value.min < 1) {
    errors.push(`${label}.min must be a positive integer`);
  }
  if (!Number.isInteger(value.max) || value.max < 1) {
    errors.push(`${label}.max must be a positive integer`);
  }
  if (
    Number.isInteger(value.min) &&
    Number.isInteger(value.max) &&
    value.min > value.max
  ) {
    errors.push(`${label}.min must be less than or equal to max`);
  }
}

function validateNotes(value, label, errors) {
  if (!Array.isArray(value) || value.length === 0) {
    errors.push(`${label} must be a non-empty array`);
    return;
  }

  value.forEach((note, index) => {
    if (typeof note !== "string" || note.trim() === "") {
      errors.push(`${label}[${index}] must be a non-empty string`);
    }
  });
}

export function validatePlatformContract(value) {
  const errors = [];
  if (
    !validateExactKeys(
      value,
      ["whiteLabelVersion", "configSchemaVersion", "backendContract"],
      "platform contract",
      errors,
    )
  ) {
    return errors;
  }

  if (
    typeof value.whiteLabelVersion !== "string" ||
    !semanticVersionPattern.test(value.whiteLabelVersion)
  ) {
    errors.push("platform contract whiteLabelVersion must be a semantic version");
  }
  if (!Number.isInteger(value.configSchemaVersion) || value.configSchemaVersion < 1) {
    errors.push("platform contract configSchemaVersion must be a positive integer");
  }
  validateBackendContract(
    value.backendContract,
    "platform contract backendContract",
    errors,
  );

  return errors;
}

export function validateReleaseManifest(value) {
  const errors = [];
  if (
    !validateExactKeys(
      value,
      [
        "schemaVersion",
        "releaseId",
        "whiteLabelVersion",
        "configSchemaVersion",
        "backendContract",
        "applications",
        "migrations",
        "featureNotes",
        "upgradeNotes",
      ],
      "release manifest",
      errors,
    )
  ) {
    return errors;
  }

  if (value.schemaVersion !== 1) {
    errors.push("release manifest schemaVersion must be 1");
  }
  if (
    typeof value.whiteLabelVersion !== "string" ||
    !semanticVersionPattern.test(value.whiteLabelVersion)
  ) {
    errors.push("release manifest whiteLabelVersion must be a semantic version");
  }
  if (
    typeof value.releaseId !== "string" ||
    value.releaseId !== `tenant-runtime-v${value.whiteLabelVersion}`
  ) {
    errors.push(
      "release manifest releaseId must match tenant-runtime-v<whiteLabelVersion>",
    );
  }
  if (!Number.isInteger(value.configSchemaVersion) || value.configSchemaVersion < 1) {
    errors.push("release manifest configSchemaVersion must be a positive integer");
  }
  validateBackendContract(
    value.backendContract,
    "release manifest backendContract",
    errors,
  );

  if (
    validateExactKeys(
      value.applications,
      ["client", "dashboard"],
      "release manifest applications",
      errors,
    )
  ) {
    for (const application of ["client", "dashboard"]) {
      const identity = value.applications[application];
      if (
        validateExactKeys(
          identity,
          ["commit"],
          `release manifest applications.${application}`,
          errors,
        ) &&
        (typeof identity.commit !== "string" || !commitPattern.test(identity.commit))
      ) {
        errors.push(
          `release manifest applications.${application}.commit must be a full lowercase Git commit`,
        );
      }
    }

    if (
      isPlainObject(value.applications.client) &&
      isPlainObject(value.applications.dashboard) &&
      value.applications.client.commit !== value.applications.dashboard.commit
    ) {
      errors.push("release manifest Client and Dashboard must use the same commit");
    }
  }

  if (!Array.isArray(value.migrations)) {
    errors.push("release manifest migrations must be an array");
  } else {
    const seenMigrationIds = new Set();
    value.migrations.forEach((migration, index) => {
      const label = `release manifest migrations[${index}]`;
      if (
        !validateExactKeys(migration, ["id", "checksum", "dependsOn"], label, errors)
      ) {
        return;
      }

      if (typeof migration.id !== "string" || !migrationIdPattern.test(migration.id)) {
        errors.push(`${label}.id must be a Supabase migration identifier`);
      } else if (seenMigrationIds.has(migration.id)) {
        errors.push(`${label}.id must be unique`);
      }

      if (
        typeof migration.checksum !== "string" ||
        !checksumPattern.test(migration.checksum)
      ) {
        errors.push(`${label}.checksum must be sha256:<64 lowercase hex characters>`);
      }

      if (!Array.isArray(migration.dependsOn)) {
        errors.push(`${label}.dependsOn must be an array`);
      } else {
        const dependencies = new Set();
        migration.dependsOn.forEach((dependency, dependencyIndex) => {
          if (typeof dependency !== "string" || !migrationIdPattern.test(dependency)) {
            errors.push(
              `${label}.dependsOn[${dependencyIndex}] must be a Supabase migration identifier`,
            );
          } else if (dependencies.has(dependency)) {
            errors.push(`${label}.dependsOn must not contain duplicate dependencies`);
          } else if (!seenMigrationIds.has(dependency)) {
            errors.push(
              `${label}.dependsOn references ${dependency} before it appears in the manifest`,
            );
          }
          dependencies.add(dependency);
        });
      }

      if (typeof migration.id === "string") seenMigrationIds.add(migration.id);
    });
  }

  validateNotes(value.featureNotes, "release manifest featureNotes", errors);
  validateNotes(value.upgradeNotes, "release manifest upgradeNotes", errors);

  return errors;
}

export function validateReleaseNotesInput(value) {
  const errors = [];
  if (
    !validateExactKeys(
      value,
      ["featureNotes", "upgradeNotes", "migrationDependencies"],
      "release notes",
      errors,
    )
  ) {
    return errors;
  }

  validateNotes(value.featureNotes, "release notes featureNotes", errors);
  validateNotes(value.upgradeNotes, "release notes upgradeNotes", errors);

  if (!isPlainObject(value.migrationDependencies)) {
    errors.push("release notes migrationDependencies must be an object");
  } else {
    for (const [migrationId, dependencies] of Object.entries(
      value.migrationDependencies,
    )) {
      if (!migrationIdPattern.test(migrationId)) {
        errors.push(
          `release notes migrationDependencies key ${migrationId} must be a Supabase migration identifier`,
        );
      }
      if (!Array.isArray(dependencies)) {
        errors.push(
          `release notes migrationDependencies.${migrationId} must be an array`,
        );
        continue;
      }

      const seen = new Set();
      dependencies.forEach((dependency, index) => {
        if (typeof dependency !== "string" || !migrationIdPattern.test(dependency)) {
          errors.push(
            `release notes migrationDependencies.${migrationId}[${index}] must be a Supabase migration identifier`,
          );
        } else if (dependency === migrationId) {
          errors.push(
            `release notes migrationDependencies.${migrationId} must not depend on itself`,
          );
        } else if (seen.has(dependency)) {
          errors.push(
            `release notes migrationDependencies.${migrationId} must not contain duplicate dependencies`,
          );
        }
        seen.add(dependency);
      });
    }
  }

  return errors;
}

export function buildReleaseManifest({
  platformContract,
  commit,
  migrations,
  featureNotes,
  upgradeNotes,
}) {
  const platformErrors = validatePlatformContract(platformContract);
  if (platformErrors.length > 0) {
    throw new Error(`Invalid platform contract:\n- ${platformErrors.join("\n- ")}`);
  }

  const manifest = {
    schemaVersion: 1,
    releaseId: `tenant-runtime-v${platformContract.whiteLabelVersion}`,
    whiteLabelVersion: platformContract.whiteLabelVersion,
    configSchemaVersion: platformContract.configSchemaVersion,
    backendContract: { ...platformContract.backendContract },
    applications: {
      client: { commit },
      dashboard: { commit },
    },
    migrations: Array.isArray(migrations)
      ? migrations.map((migration) => ({
          id: migration.id,
          checksum: migration.checksum,
          dependsOn: Array.isArray(migration.dependsOn)
            ? [...migration.dependsOn]
            : migration.dependsOn,
        }))
      : migrations,
    featureNotes: Array.isArray(featureNotes) ? [...featureNotes] : featureNotes,
    upgradeNotes: Array.isArray(upgradeNotes) ? [...upgradeNotes] : upgradeNotes,
  };

  const manifestErrors = validateReleaseManifest(manifest);
  if (manifestErrors.length > 0) {
    throw new Error(`Invalid release manifest:\n- ${manifestErrors.join("\n- ")}`);
  }

  return manifest;
}

export function assessReleaseCompatibility(manifest, backendContractVersion) {
  const errors = validateReleaseManifest(manifest);

  if (!Number.isInteger(backendContractVersion) || backendContractVersion < 1) {
    errors.push("deployed backend contract version must be a positive integer");
  }

  if (
    errors.length === 0 &&
    (backendContractVersion < manifest.backendContract.min ||
      backendContractVersion > manifest.backendContract.max)
  ) {
    errors.push(
      `deployed backend contract version ${backendContractVersion} is outside supported range ${manifest.backendContract.min}-${manifest.backendContract.max}`,
    );
  }

  return { compatible: errors.length === 0, errors };
}
