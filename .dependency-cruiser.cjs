/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "no-circular",
      severity: "error",
      comment: "Workspace modules must form an acyclic dependency graph.",
      from: {},
      to: { circular: true },
    },
    {
      name: "packages-do-not-import-apps",
      severity: "error",
      comment: "Applications consume packages; packages never consume applications.",
      from: { path: "^packages/" },
      to: { path: "^apps/" },
    },
    {
      name: "apps-use-package-entry-points",
      severity: "error",
      comment: "Private implementation folders are sealed behind package entry points.",
      from: { path: "^apps/" },
      to: { path: "^packages/[^/]+/src/(internal|lib|tests?)/" },
    },
    {
      name: "tests-use-public-entry-points",
      severity: "error",
      comment: "Tests exercise the same public entry point used by consumers.",
      from: { path: "((^|/)(test|tests|__tests__)/|\\.(test|spec)\\.[cm]?[jt]sx?$)" },
      to: { path: "^packages/[^/]+/src/(internal|lib)/" },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    exclude: "(^|/)(\\.next|\\.turbo|coverage|dist|node_modules)/",
    tsPreCompilationDeps: true,
    tsConfig: { fileName: "tsconfig.base.json" },
    reporterOptions: {
      text: { highlightFocused: true },
    },
  },
};
