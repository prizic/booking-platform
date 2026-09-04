import { readFile } from "node:fs/promises";
import path from "node:path";

import { failCheck, pathExists, readJson, repositoryRoot } from "./workspace.mjs";

const errors = [];

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requireExactKeys(value, keys, label) {
  if (!isPlainObject(value)) {
    errors.push(`${label} must be an object`);
    return;
  }
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    errors.push(
      `${label} keys must be exactly ${expected.join(", ")}; found ${actual.join(", ")}`,
    );
  }
}

function requireStringFields(value, keys, label) {
  requireExactKeys(value, keys, label);
  if (!isPlainObject(value)) return;
  for (const key of keys) {
    if (typeof value[key] !== "string" || value[key].trim() === "") {
      errors.push(`${label}.${key} must be a non-empty string`);
    }
  }
}

function validateBackendContract(value, label) {
  requireExactKeys(value, ["min", "max"], label);
  if (!isPlainObject(value)) return;
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

const contractPath = path.join(repositoryRoot, "platform-contract.json");
const contract = await readJson(contractPath);
requireExactKeys(
  contract,
  ["whiteLabelVersion", "configSchemaVersion", "backendContract"],
  "platform-contract.json",
);

if (
  !isPlainObject(contract) ||
  typeof contract.whiteLabelVersion !== "string" ||
  !/^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/u.test(contract.whiteLabelVersion)
) {
  errors.push("platform-contract.json whiteLabelVersion must be a semver string");
}
if (
  !Number.isInteger(contract.configSchemaVersion) ||
  contract.configSchemaVersion < 1
) {
  errors.push("platform-contract.json configSchemaVersion must be a positive integer");
}
validateBackendContract(
  contract.backendContract,
  "platform-contract.json backendContract",
);

const instancePath = path.join(repositoryRoot, "instance-template", "instance");
if (await pathExists(instancePath)) {
  const requiredFiles = [
    "manifest.template.json",
    "brand.json",
    "features.json",
    "navigation.json",
    "content/en.json",
    "content/ar.json",
  ];
  const missingFiles = [];
  for (const relativeFile of requiredFiles) {
    if (!(await pathExists(path.join(instancePath, relativeFile)))) {
      missingFiles.push(relativeFile);
    }
  }

  if (missingFiles.length > 0) {
    errors.push(`instance-template/instance is missing ${missingFiles.join(", ")}`);
  } else {
    const manifestTemplate = await readJson(
      path.join(instancePath, "manifest.template.json"),
    );
    requireExactKeys(
      manifestTemplate,
      ["tenantId", "instanceId", "defaultLocale", "supportedLocales"],
      "instance manifest template",
    );
    const manifest = {
      ...manifestTemplate,
      whiteLabelVersion: contract.whiteLabelVersion,
      configSchemaVersion: contract.configSchemaVersion,
      backendContract: contract.backendContract,
    };
    for (const idField of ["tenantId", "instanceId"]) {
      if (typeof manifest[idField] !== "string" || manifest[idField].trim() === "") {
        errors.push(`instance manifest template ${idField} must be a non-empty string`);
      }
    }
    if (manifest.defaultLocale !== "en" && manifest.defaultLocale !== "ar") {
      errors.push("instance manifest template defaultLocale must be en or ar");
    }
    if (
      !Array.isArray(manifest.supportedLocales) ||
      manifest.supportedLocales.length !== 2 ||
      !manifest.supportedLocales.includes("en") ||
      !manifest.supportedLocales.includes("ar")
    ) {
      errors.push(
        "instance manifest template supportedLocales must contain exactly en and ar",
      );
    }

    for (const app of ["client", "dashboard"]) {
      const policyPath = path.join(
        repositoryRoot,
        "apps",
        app,
        "instance-locale-policy.json",
      );
      if (!(await pathExists(policyPath))) {
        errors.push(`apps/${app} is missing its generated instance locale policy`);
        continue;
      }
      const policy = await readJson(policyPath);
      requireExactKeys(
        policy,
        ["defaultLocale", "supportedLocales"],
        `apps/${app} locale policy`,
      );
      if (
        policy.defaultLocale !== manifest.defaultLocale ||
        JSON.stringify(policy.supportedLocales) !==
          JSON.stringify(manifest.supportedLocales)
      ) {
        errors.push(
          `apps/${app} locale policy drifted from instance manifest template`,
        );
      }
    }

    const brand = await readJson(path.join(instancePath, "brand.json"));
    requireExactKeys(brand, ["name", "assets", "tokens"], "brand.json");
    if (
      !isPlainObject(brand) ||
      typeof brand.name !== "string" ||
      brand.name.trim() === ""
    ) {
      errors.push("brand.json must contain a non-empty name");
    } else {
      const assetKeys = ["logoLight", "logoDark", "icon", "favicon", "socialImage"];
      requireStringFields(brand.assets, assetKeys, "brand.json assets");
      if (isPlainObject(brand.assets)) {
        for (const key of assetKeys) {
          const asset = brand.assets[key];
          if (typeof asset !== "string" || !asset.startsWith("/assets/")) continue;
          if (!(await pathExists(path.join(instancePath, asset.slice(1))))) {
            errors.push(`brand.json assets.${key} points to missing ${asset}`);
          }
        }
      }

      requireExactKeys(
        brand.tokens,
        ["color", "radius", "motion", "typography"],
        "brand.json tokens",
      );
      if (isPlainObject(brand.tokens)) {
        requireStringFields(
          brand.tokens.color,
          [
            "background",
            "surface",
            "text",
            "muted",
            "border",
            "primary",
            "onPrimary",
            "success",
            "warning",
            "danger",
            "focus",
          ],
          "brand.json tokens.color",
        );
        requireStringFields(
          brand.tokens.radius,
          ["control", "surface"],
          "brand.json tokens.radius",
        );
        requireStringFields(
          brand.tokens.motion,
          ["standard", "reduced"],
          "brand.json tokens.motion",
        );
        requireStringFields(
          brand.tokens.typography,
          ["bodyFamily", "displayFamily"],
          "brand.json tokens.typography",
        );
      }

      const theme = await readFile(path.join(instancePath, "theme.css"), "utf8");
      for (const property of [
        "--brand-color-background",
        "--brand-color-surface",
        "--brand-color-text",
        "--brand-color-muted",
        "--brand-color-border",
        "--brand-color-primary",
        "--brand-color-on-primary",
        "--brand-color-success",
        "--brand-color-warning",
        "--brand-color-danger",
        "--brand-color-focus",
        "--brand-radius-control",
        "--brand-radius-surface",
        "--brand-motion-standard",
        "--brand-motion-reduced",
        "--brand-font-body",
        "--brand-font-display",
      ]) {
        if (!theme.includes(`${property}:`)) {
          errors.push(`theme.css is missing ${property}`);
        }
      }
    }

    const features = await readJson(path.join(instancePath, "features.json"));
    if (!isPlainObject(features) || Object.keys(features).length === 0) {
      errors.push("features.json must be a non-empty object");
    } else {
      for (const [featureName, feature] of Object.entries(features)) {
        if (!isPlainObject(feature) || typeof feature.enabled !== "boolean") {
          errors.push(`features.json ${featureName} must have a boolean enabled field`);
        }
      }
    }

    const navigation = await readJson(path.join(instancePath, "navigation.json"));
    requireExactKeys(navigation, ["client", "dashboard"], "navigation.json");
    for (const surface of ["client", "dashboard"]) {
      const items = navigation[surface];
      if (
        !Array.isArray(items) ||
        items.length === 0 ||
        items.some((item) => typeof item !== "string" || item.trim() === "") ||
        new Set(items).size !== items.length
      ) {
        errors.push(
          `navigation.json ${surface} must be a non-empty list of unique keys`,
        );
      }
    }

    const content = {
      en: await readJson(path.join(instancePath, "content", "en.json")),
      ar: await readJson(path.join(instancePath, "content", "ar.json")),
    };
    const englishKeys = isPlainObject(content.en) ? Object.keys(content.en).sort() : [];
    const arabicKeys = isPlainObject(content.ar) ? Object.keys(content.ar).sort() : [];
    if (!isPlainObject(content.en) || !isPlainObject(content.ar)) {
      errors.push("localized content files must be JSON objects");
    } else if (JSON.stringify(englishKeys) !== JSON.stringify(arabicKeys)) {
      errors.push(
        "content/en.json and content/ar.json must have identical message keys",
      );
    }
    for (const locale of ["en", "ar"]) {
      for (const [key, value] of Object.entries(content[locale])) {
        if (typeof value !== "string" || value.trim() === "") {
          errors.push(`content/${locale}.json ${key} must be a non-empty string`);
        }
      }
    }
    for (const surface of ["client", "dashboard"]) {
      for (const item of navigation[surface] ?? []) {
        const contentKey = `navigation.${item}`;
        if (!(contentKey in content.en) || !(contentKey in content.ar)) {
          errors.push(
            `${surface} navigation key ${item} is missing localized ${contentKey}`,
          );
        }
      }
    }
  }
}

failCheck("platform contract and instance configuration", [...new Set(errors)].sort());
