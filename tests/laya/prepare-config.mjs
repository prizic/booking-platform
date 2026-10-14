import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(import.meta.url), "..", "..", "..");
const baseUrl = process.env.LAYA_BASE_URL || "http://localhost:41730";
const suiteFile = process.env.LAYA_SUITE_FILE || "client-public.json";
const suitePath = resolve(root, "tests", "laya", suiteFile);
const outputDir = resolve(
  root,
  process.env.LAYA_OUTPUT_DIR || ".artifacts/booking-journey-20261014/laya",
);
const locale = process.env.LAYA_LOCALE || "ar";
const outputName = process.env.LAYA_CONFIG_NAME || "laya-test.config.json";

mkdirSync(outputDir, { recursive: true });
// Evidence dirs stay private to the operator running the suite.
chmodSync(outputDir, 0o700);
chmodSync(resolve(outputDir, ".."), 0o700);

const config = {
  base_url: baseUrl,
  suite_path: suitePath,
  test_suite: "booking-client-public",
  locale,
  headless: true,
  max_steps_per_scenario: 20,
  confidence_threshold: 0.6,
  action_retry_limit: 1,
  decision_retry_limit: 0,
  use_laya: true,
  capture_screenshots: true,
  capture_screenshots_on_failure: true,
  trace_capture: "all",
  log_console: true,
  log_network: true,
  escalation_behavior: "report",
  output_dir: outputDir,
  safe_test_origins: [],
  network_allow_patterns: [`^${baseUrl}/en/this-route-does-not-exist(?:\\?.*)?$`],
  allow_state_changes: false,
  storage_state: null,
  reduced_motion: "reduce",
  viewports: {
    desktop: { width: 1440, height: 900 },
    tablet: { width: 768, height: 1024 },
    mobile: { width: 390, height: 844 },
  },
  min_memory_free_percent: 25,
  max_process_tree_rss_mb: 5000,
  mlx_memory_mb: 3072,
};

const configPath = resolve(root, outputName);
writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");
chmodSync(configPath, 0o600);
console.log(`Wrote ${configPath}`);
console.log(`Suite: ${suitePath}`);
console.log(`Output: ${outputDir}`);
console.log(`Base URL: ${baseUrl}`);
