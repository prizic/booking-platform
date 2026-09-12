import eslint from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";
import globals from "globals";
import tseslint from "typescript-eslint";

export default defineConfig(
  globalIgnores([
    "**/.next/**",
    "**/.next-warm/**",
    // Playwright starts brand-fixture dev servers with their own dist dirs.
    "**/.next-warm-*/**",
    "**/.next-live-*/**",
    "**/.turbo/**",
    "**/coverage/**",
    "**/dist/**",
    "**/node_modules/**",
    "instance-template/instance/theme.css",
  ]),
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  ...nextVitals,
  ...nextTypeScript,
  {
    settings: {
      react: { version: "19.2" },
    },
  },
  {
    files: ["**/*.{js,mjs,cjs}"],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    // Platform Edge Functions run on Deno, are deployed only by the release
    // pipeline, and are typechecked by the Supabase CLI rather than by a
    // workspace project.
    files: ["supabase/functions/**/*.ts"],
    languageOptions: {
      globals: { Deno: "readonly" },
    },
  },
  {
    files: ["**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { fixStyle: "inline-type-imports" },
      ],
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "no-unused-vars": "off",
    },
  },
  {
    rules: {
      "@next/next/no-html-link-for-pages": "off",
    },
  },
);
