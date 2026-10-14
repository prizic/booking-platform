import { defineConfig } from "vitest/config";

// Next preserves JSX for its compiler; Vitest needs its own automatic transform.
export default defineConfig({
  oxc: {
    jsx: {
      importSource: "react",
      runtime: "automatic",
    },
  },
});
