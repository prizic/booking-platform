import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  APPROVED_DATABASE_PORTS,
  isIsolatedWorkdir,
  isPlaywrightCommand,
  journeyClockPath,
  preflightJourneyClock,
  selectedCampaignDatabasePort,
  shouldRunJourneyPreflight,
  validateJourneyClock,
} from "./journey-preflight.mjs";

// A campaign shell exports these; the unit results must not depend on which
// campaign (if any) the operator happens to have configured.
const managedEnvKeys = [
  "JOURNEY_SPAWN_MARKER",
  "WLBP_CAMPAIGN",
  "WLBP_CAMPAIGN_INSPECTOR_PORT",
  "WLBP_CAMPAIGN_OUTPUT",
  "WLBP_CAMPAIGN_PORT_PREFIX",
  "WLBP_JOURNEY_A11Y",
  "WLBP_JOURNEY_CLOCK_FILE",
  "WLBP_JOURNEY_E2E",
  "WLBP_JOURNEY_MAILBOX",
  "WLBP_JOURNEY_OUTPUT",
  "WLBP_JOURNEY_REPORT",
  "WLBP_JOURNEY_RESULTS",
  "WLBP_SUPABASE_WORKDIR",
];
let savedEnv;
before(() => {
  savedEnv = {};
  for (const key of managedEnvKeys) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
});
after(() => {
  for (const key of managedEnvKeys) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
});

function withEnv(overrides, fn) {
  const saved = {};
  for (const key of Object.keys(overrides)) saved[key] = process.env[key];
  try {
    for (const [key, value] of Object.entries(overrides)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    return fn();
  } finally {
    for (const key of Object.keys(overrides)) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  }
}

function tempClock(content) {
  const dir = mkdtempSync(join(tmpdir(), "journey-preflight-"));
  const file = join(dir, "fixture-clock.json");
  writeFileSync(file, content, "utf8");
  return { dir, file };
}

const isoWorkdir = "/tmp/booking-journey/.artifacts/campaign/isolated";
const envBase = {
  WLBP_JOURNEY_E2E: "1",
  WLBP_CAMPAIGN_PORT_PREFIX: "578",
  WLBP_SUPABASE_WORKDIR: isoWorkdir,
};

test("preflight is inactive unless WLBP_JOURNEY_E2E is 1", () => {
  const { dir, file } = tempClock("not-json");
  try {
    withEnv({ WLBP_JOURNEY_E2E: undefined, WLBP_JOURNEY_CLOCK_FILE: file }, () => {
      assert.equal(validateJourneyClock(), null);
      assert.doesNotThrow(() => preflightJourneyClock());
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("missing clock fails with an actionable precondition", () => {
  const dir = mkdtempSync(join(tmpdir(), "journey-preflight-"));
  const file = join(dir, "missing.json");
  try {
    withEnv({ ...envBase, WLBP_JOURNEY_CLOCK_FILE: file }, () => {
      assert.throws(
        () => preflightJourneyClock(),
        /Prepare the isolated journey fixture clock/i,
      );
      assert.throws(
        () => preflightJourneyClock(),
        /clock file is missing or unreadable/i,
      );
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("invalid JSON clock fails", () => {
  const { dir, file } = tempClock("{bad json");
  try {
    withEnv({ ...envBase, WLBP_JOURNEY_CLOCK_FILE: file }, () => {
      assert.throws(() => preflightJourneyClock(), /invalid JSON/i);
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("wrong-but-approved profile (57822 marker against 579 campaign) fails", () => {
  const { dir, file } = tempClock(
    JSON.stringify({
      seededAt: new Date().toISOString(),
      timeZone: "America/New_York",
      databaseProfile: "57822",
      source: "booking-journey.sql",
    }),
  );
  try {
    withEnv(
      {
        ...envBase,
        WLBP_JOURNEY_CLOCK_FILE: file,
        WLBP_CAMPAIGN_PORT_PREFIX: "579",
        WLBP_SUPABASE_WORKDIR: "/tmp/.artifacts/other/isolated",
      },
      () => {
        assert.throws(
          () => preflightJourneyClock(),
          /does not match the selected campaign database 57922/i,
        );
      },
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("missing workdir fails", () => {
  const { dir, file } = tempClock(
    JSON.stringify({
      seededAt: new Date().toISOString(),
      timeZone: "America/New_York",
      databaseProfile: "57822",
      source: "booking-journey.sql",
    }),
  );
  try {
    withEnv(
      {
        WLBP_JOURNEY_E2E: "1",
        WLBP_JOURNEY_CLOCK_FILE: file,
        WLBP_CAMPAIGN_PORT_PREFIX: "578",
        WLBP_SUPABASE_WORKDIR: undefined,
      },
      () => {
        assert.throws(
          () => preflightJourneyClock(),
          /absolute isolated campaign workdir required/i,
        );
      },
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("future marker fails", () => {
  const { dir, file } = tempClock(
    JSON.stringify({
      seededAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      timeZone: "America/New_York",
      databaseProfile: "57822",
      source: "booking-journey.sql",
    }),
  );
  try {
    withEnv({ ...envBase, WLBP_JOURNEY_CLOCK_FILE: file }, () => {
      assert.throws(() => preflightJourneyClock(), /in the future/i);
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("wrong source fails", () => {
  const { dir, file } = tempClock(
    JSON.stringify({
      seededAt: new Date().toISOString(),
      timeZone: "America/New_York",
      databaseProfile: "57822",
      source: "not-the-fixture.sql",
    }),
  );
  try {
    withEnv({ ...envBase, WLBP_JOURNEY_CLOCK_FILE: file }, () => {
      assert.throws(
        () => preflightJourneyClock(),
        /source must be booking-journey\.sql/i,
      );
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("unapproved database profile fails", () => {
  const { dir, file } = tempClock(
    JSON.stringify({
      seededAt: new Date().toISOString(),
      timeZone: "America/New_York",
      databaseProfile: "54322",
      source: "booking-journey.sql",
    }),
  );
  try {
    withEnv({ ...envBase, WLBP_JOURNEY_CLOCK_FILE: file }, () => {
      assert.throws(
        () => preflightJourneyClock(),
        /does not match an approved isolated campaign database/i,
      );
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("valid clock passes freshness, profile and selected port", () => {
  const { dir, file } = tempClock(
    JSON.stringify({
      seededAt: new Date().toISOString(),
      timeZone: "America/New_York",
      databaseProfile: "57822",
      source: "booking-journey.sql",
    }),
  );
  try {
    withEnv({ ...envBase, WLBP_JOURNEY_CLOCK_FILE: file }, () => {
      const clock = preflightJourneyClock();
      assert.equal(clock.timeZone, "America/New_York");
      assert.equal(clock.databaseProfile, "57822");
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("isPlaywrightCommand detects actual Playwright commands only", () => {
  assert.equal(isPlaywrightCommand("playwright", ["test", "--project=e2e"]), true);
  assert.equal(
    isPlaywrightCommand("pnpm", ["exec", "playwright", "test", "--project=e2e"]),
    true,
  );
  assert.equal(isPlaywrightCommand("node", ["scripts/verify-journey.mjs"]), false);
  assert.equal(isPlaywrightCommand("pnpm", ["check:fast"]), false);
});

test("shouldRunJourneyPreflight bypasses setup/check:fast/test:db non-browser phases", () => {
  assert.equal(
    shouldRunJourneyPreflight("setup", "pnpm", ["exec", "playwright", "test"]),
    false,
  );
  assert.equal(shouldRunJourneyPreflight("suite", "pnpm", ["check:fast"]), false);
  assert.equal(shouldRunJourneyPreflight("suite", "pnpm", ["test:db"]), false);
  withEnv({ WLBP_JOURNEY_E2E: "1" }, () => {
    assert.equal(
      shouldRunJourneyPreflight("suite", "pnpm", ["exec", "playwright", "test"]),
      true,
    );
  });
});

test("journeyClockPath honours override", () => {
  withEnv({ WLBP_JOURNEY_CLOCK_FILE: "/tmp/example/clock.json" }, () => {
    assert.equal(journeyClockPath(), "/tmp/example/clock.json");
  });
});

test("selectedCampaignDatabasePort reads isolated config before prefix", () => {
  const dir = mkdtempSync(join(tmpdir(), "journey-preflight-"));
  const isolated = join(dir, ".artifacts", "work", "isolated");
  mkdirSync(join(isolated, "supabase"), { recursive: true });
  writeFileSync(
    join(isolated, "supabase", "config.toml"),
    "[api]\nport = 57921\n[db]\nport = 57922\nshadow_port = 57920\n",
    "utf8",
  );
  try {
    const port = withEnv(
      {
        WLBP_SUPABASE_WORKDIR: isolated,
        WLBP_CAMPAIGN_PORT_PREFIX: "579",
      },
      () => selectedCampaignDatabasePort(),
    );
    assert.equal(port, "57922");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("selectedCampaignDatabasePort has no implicit default once config and prefix are absent", () => {
  const dir = mkdtempSync(join(tmpdir(), "journey-preflight-"));
  const isolated = join(dir, ".artifacts", "work", "isolated");
  mkdirSync(isolated, { recursive: true });
  try {
    withEnv(
      {
        WLBP_SUPABASE_WORKDIR: isolated,
        WLBP_CAMPAIGN_PORT_PREFIX: undefined,
      },
      () => {
        assert.throws(
          () => selectedCampaignDatabasePort(),
          /No campaign database port can be determined/i,
        );
      },
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("isIsolatedWorkdir requires an absolute isolated path", () => {
  assert.equal(isIsolatedWorkdir("/repo/.artifacts/x/isolated"), true);
  assert.equal(isIsolatedWorkdir(".artifacts/x/isolated"), false);
  assert.equal(isIsolatedWorkdir("/repo/.artifacts/x/staging"), false);
});

test("approved ports exclude the retained Supabase default database", () => {
  // 54322 is the retained/default project's database port; accepting it would
  // let a journey clock bind tests to a stack the campaign does not own.
  assert.ok(APPROVED_DATABASE_PORTS.has("57822"));
  assert.equal(APPROVED_DATABASE_PORTS.has("54322"), false);
});
