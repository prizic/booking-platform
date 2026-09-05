import { readFile } from "node:fs/promises";
import path from "node:path";

import { validateBrandAssetSource } from "../packages/config/instance-brand.mjs";
import { parseBrandAssets } from "../packages/white-label-ui/src/brand-assets.ts";
import { validateBrandTokens } from "../packages/white-label-ui/src/brand-tokens.ts";
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

function requireOptionalStringFields(value, requiredKeys, optionalKeys, label) {
  if (!isPlainObject(value)) {
    errors.push(`${label} must be an object`);
    return;
  }
  const allowedKeys = new Set([...requiredKeys, ...optionalKeys]);
  const unexpectedKeys = Object.keys(value).filter((key) => !allowedKeys.has(key));
  for (const key of requiredKeys) {
    if (typeof value[key] !== "string" || value[key].trim() === "") {
      errors.push(`${label}.${key} must be a non-empty string`);
    }
  }
  for (const key of optionalKeys) {
    if (
      value[key] !== undefined &&
      (typeof value[key] !== "string" || value[key].trim() === "")
    ) {
      errors.push(`${label}.${key} must be a non-empty string when present`);
    }
  }
  if (unexpectedKeys.length > 0) {
    errors.push(`${label} has unexpected keys: ${unexpectedKeys.sort().join(", ")}`);
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

function expectedThemeDeclarations(tokens) {
  return {
    root: {
      "--brand-color-background": tokens.color.background,
      "--brand-color-surface": tokens.color.surface,
      "--brand-color-text": tokens.color.text,
      "--brand-color-muted": tokens.color.muted,
      "--brand-color-border": tokens.color.border,
      "--brand-color-primary": tokens.color.primary,
      "--brand-color-on-primary": tokens.color.onPrimary,
      "--brand-color-success": tokens.color.success,
      "--brand-color-on-success": tokens.color.onSuccess,
      "--brand-color-warning": tokens.color.warning,
      "--brand-color-on-warning": tokens.color.onWarning,
      "--brand-color-danger": tokens.color.danger,
      "--brand-color-on-danger": tokens.color.onDanger,
      "--brand-color-focus": tokens.color.focus,
      "--brand-font-body": tokens.typography.bodyFamily,
      "--brand-font-display": tokens.typography.displayFamily,
      "--brand-font-arabic-body": tokens.typography.arabicBodyFamily,
      "--brand-font-arabic-display": tokens.typography.arabicDisplayFamily,
      "--brand-font-size-caption": tokens.typography.size.caption,
      "--brand-font-size-body": tokens.typography.size.body,
      "--brand-font-size-label": tokens.typography.size.label,
      "--brand-font-size-title": tokens.typography.size.title,
      "--brand-font-size-display": tokens.typography.size.display,
      "--brand-font-weight-regular": tokens.typography.weight.regular,
      "--brand-font-weight-medium": tokens.typography.weight.medium,
      "--brand-font-weight-semibold": tokens.typography.weight.semibold,
      "--brand-font-weight-bold": tokens.typography.weight.bold,
      "--brand-line-height-compact": tokens.typography.lineHeight.compact,
      "--brand-line-height-body": tokens.typography.lineHeight.body,
      "--brand-line-height-relaxed": tokens.typography.lineHeight.relaxed,
      "--brand-radius-control": tokens.radius.control,
      "--brand-radius-surface": tokens.radius.surface,
      "--brand-radius-pill": tokens.radius.pill,
      "--brand-border-width-default": tokens.borderWidth.default,
      "--brand-border-width-strong": tokens.borderWidth.strong,
      "--brand-space-xxs": tokens.spacing.xxs,
      "--brand-space-xs": tokens.spacing.xs,
      "--brand-space-sm": tokens.spacing.sm,
      "--brand-space-md": tokens.spacing.md,
      "--brand-space-lg": tokens.spacing.lg,
      "--brand-space-xl": tokens.spacing.xl,
      "--brand-space-xxl": tokens.spacing.xxl,
      "--brand-content-width-form": tokens.contentWidth.form,
      "--brand-content-width-reading": tokens.contentWidth.reading,
      "--brand-content-width-wide": tokens.contentWidth.wide,
      "--brand-motion-fast": tokens.motion.fast,
      "--brand-motion-standard": tokens.motion.standard,
      "--brand-motion-slow": tokens.motion.slow,
      "--brand-motion-reduced-fast": tokens.motion.reducedFast,
      "--brand-motion-reduced": tokens.motion.reduced,
      "--brand-motion-reduced-slow": tokens.motion.reducedSlow,
      "--brand-motion-easing-standard": tokens.motion.easingStandard,
      "--brand-motion-easing-exit": tokens.motion.easingExit,
    },
    rtl: {
      "--brand-font-body": tokens.typography.arabicBodyFamily,
      "--brand-font-display": tokens.typography.arabicDisplayFamily,
    },
  };
}

function parseThemeRuleDeclarations(body, selector, themeErrors) {
  const declarations = {};
  const parts = body.split(";");
  if (parts.at(-1)?.trim() !== "") {
    themeErrors.push(`theme.css ${selector} declarations must end with semicolons`);
  }

  for (const part of parts) {
    const declaration = part.trim();
    if (declaration === "") continue;
    const match = /^(--brand-[a-z0-9-]+)\s*:\s*(.+)$/u.exec(declaration);
    if (!match) {
      themeErrors.push(`theme.css ${selector} has invalid declaration ${declaration}`);
      continue;
    }
    const [, property, value] = match;
    if (Object.hasOwn(declarations, property)) {
      themeErrors.push(`theme.css ${selector} duplicates ${property}`);
      continue;
    }
    declarations[property] = value.trim();
  }

  return declarations;
}

function validateExactThemeDeclarations(actual, expected, selector, themeErrors) {
  for (const property of Object.keys(actual)) {
    if (!Object.hasOwn(expected, property)) {
      themeErrors.push(`theme.css ${selector} has unexpected declaration ${property}`);
    }
  }
  for (const [property, expectedValue] of Object.entries(expected)) {
    if (!Object.hasOwn(actual, property)) {
      themeErrors.push(`theme.css ${selector} is missing ${property}`);
    } else if (actual[property] !== expectedValue) {
      themeErrors.push(
        `theme.css ${selector} ${property} must equal brand.json value ${expectedValue}`,
      );
    }
  }
}

export function validateThemeCss(source, tokens) {
  const themeErrors = [];
  const expected = expectedThemeDeclarations(tokens);
  const rules = new Map();
  const withoutComments = source.replace(/\/\*[\s\S]*?\*\//gu, "");
  const rulePattern = /([^{}]+)\{([^{}]*)\}/gu;
  let lastIndex = 0;

  for (const match of withoutComments.matchAll(rulePattern)) {
    if (withoutComments.slice(lastIndex, match.index).trim() !== "") {
      themeErrors.push("theme.css contains unsupported nested or malformed CSS");
    }
    lastIndex = match.index + match[0].length;

    const selector = match[1].trim();
    if (selector !== ":root" && selector !== '[dir="rtl"]') {
      themeErrors.push(`theme.css has unsupported selector ${selector}`);
      continue;
    }
    if (rules.has(selector)) {
      themeErrors.push(`theme.css duplicates selector ${selector}`);
      continue;
    }
    rules.set(selector, parseThemeRuleDeclarations(match[2], selector, themeErrors));
  }

  if (withoutComments.slice(lastIndex).trim() !== "") {
    themeErrors.push("theme.css contains unsupported nested or malformed CSS");
  }

  if (
    rules.has(":root") &&
    rules.has('[dir="rtl"]') &&
    [...rules.keys()].join("|") !== ':root|[dir="rtl"]'
  ) {
    themeErrors.push('theme.css selectors must be ordered :root then [dir="rtl"]');
  }

  for (const [selector, declarations] of [
    [":root", expected.root],
    ['[dir="rtl"]', expected.rtl],
  ]) {
    const actual = rules.get(selector);
    if (actual === undefined) {
      themeErrors.push(`theme.css is missing selector ${selector}`);
      continue;
    }
    validateExactThemeDeclarations(actual, declarations, selector, themeErrors);
  }

  return themeErrors;
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

const sourceTemplateRoot = path.join(repositoryRoot, "instance-template");
const sourceInstancePath = path.join(sourceTemplateRoot, "instance");
const generatedInstancePath = path.join(repositoryRoot, "instance");
const hasSourceTemplate = await pathExists(sourceTemplateRoot);
const hasGeneratedInstance = await pathExists(generatedInstancePath);
let instancePath;
let manifestFile;
let manifestLabel;

if (hasSourceTemplate && hasGeneratedInstance) {
  errors.push(
    "configuration mode is ambiguous: source instance-template/ and generated instance/ cannot coexist",
  );
} else if (hasSourceTemplate) {
  instancePath = sourceInstancePath;
  manifestFile = "manifest.template.json";
  manifestLabel = "instance manifest template";
} else if (hasGeneratedInstance) {
  instancePath = generatedInstancePath;
  manifestFile = "manifest.json";
  manifestLabel = "generated instance manifest";
} else {
  errors.push(
    "configuration mode is unknown: expected source instance-template/ or generated instance/",
  );
}

if (instancePath !== undefined) {
  const wrongManifestFile =
    manifestFile === "manifest.json" ? "manifest.template.json" : "manifest.json";
  if (await pathExists(path.join(instancePath, wrongManifestFile))) {
    errors.push(
      `${path.relative(repositoryRoot, instancePath)}/ must use ${manifestFile}, not ${wrongManifestFile}`,
    );
  }
  const requiredFiles = [
    manifestFile,
    "brand.json",
    "features.json",
    "navigation.json",
    "content/en.json",
    "content/ar.json",
    "theme.css",
  ];
  const missingFiles = [];
  for (const relativeFile of requiredFiles) {
    if (!(await pathExists(path.join(instancePath, relativeFile)))) {
      missingFiles.push(relativeFile);
    }
  }

  if (missingFiles.length > 0) {
    errors.push(
      `${path.relative(repositoryRoot, instancePath)} is missing ${missingFiles.join(", ")}`,
    );
  } else {
    const manifestSource = await readJson(path.join(instancePath, manifestFile));
    requireExactKeys(
      manifestSource,
      manifestFile === "manifest.template.json"
        ? ["tenantId", "instanceId", "defaultLocale", "supportedLocales"]
        : [
            "tenantId",
            "instanceId",
            "defaultLocale",
            "supportedLocales",
            "whiteLabelVersion",
            "configSchemaVersion",
            "backendContract",
          ],
      manifestLabel,
    );
    const manifest =
      manifestFile === "manifest.template.json"
        ? {
            ...manifestSource,
            whiteLabelVersion: contract.whiteLabelVersion,
            configSchemaVersion: contract.configSchemaVersion,
            backendContract: contract.backendContract,
          }
        : manifestSource;
    for (const idField of ["tenantId", "instanceId"]) {
      if (typeof manifest[idField] !== "string" || manifest[idField].trim() === "") {
        errors.push(`${manifestLabel} ${idField} must be a non-empty string`);
      }
    }
    if (manifest.defaultLocale !== "en" && manifest.defaultLocale !== "ar") {
      errors.push(`${manifestLabel} defaultLocale must be en or ar`);
    }
    validateBackendContract(
      manifest.backendContract,
      `${manifestLabel} backendContract`,
    );
    if (
      !Array.isArray(manifest.supportedLocales) ||
      manifest.supportedLocales.length !== 2 ||
      !manifest.supportedLocales.includes("en") ||
      !manifest.supportedLocales.includes("ar")
    ) {
      errors.push(`${manifestLabel} supportedLocales must contain exactly en and ar`);
    }
    if (manifestFile === "manifest.json") {
      if (manifest.whiteLabelVersion !== contract.whiteLabelVersion) {
        errors.push(
          "generated instance manifest whiteLabelVersion must match platform-contract.json",
        );
      }
      if (manifest.configSchemaVersion !== contract.configSchemaVersion) {
        errors.push(
          "generated instance manifest configSchemaVersion must match platform-contract.json",
        );
      }
      if (
        !isPlainObject(manifest.backendContract) ||
        manifest.backendContract.min !== contract.backendContract.min ||
        manifest.backendContract.max !== contract.backendContract.max
      ) {
        errors.push(
          "generated instance manifest backendContract must match platform-contract.json",
        );
      }
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
        errors.push(`apps/${app} locale policy drifted from ${manifestLabel}`);
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
      const requiredAssetKeys = ["logoLight", "icon", "favicon", "socialImage"];
      const assetKeys = [...requiredAssetKeys, "logoDark"];
      requireOptionalStringFields(
        brand.assets,
        requiredAssetKeys,
        ["logoDark"],
        "brand.json assets",
      );
      if (isPlainObject(brand.assets)) {
        try {
          parseBrandAssets(brand.assets);
        } catch (error) {
          errors.push(error instanceof Error ? error.message : String(error));
        }
        for (const key of assetKeys) {
          const asset = brand.assets[key];
          if (key === "logoDark" && asset === undefined) continue;
          if (typeof asset !== "string" || !asset.startsWith("/assets/")) continue;
          try {
            validateBrandAssetSource(instancePath, key, asset);
          } catch (error) {
            errors.push(error instanceof Error ? error.message : String(error));
          }
        }
      }

      const tokenErrors = validateBrandTokens(brand.tokens);
      errors.push(...tokenErrors.map((error) => `brand.json tokens: ${error}`));

      const theme = await readFile(path.join(instancePath, "theme.css"), "utf8");
      if (tokenErrors.length === 0) {
        errors.push(...validateThemeCss(theme, brand.tokens));
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
