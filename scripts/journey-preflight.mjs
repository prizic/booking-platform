import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";

export const APPROVED_DATABASE_PORTS = new Set(["55322", "57722", "57822", "57922"]);

export const JOURNEY_CLOCK_SOURCE = "booking-journey.sql";

function formatNewYorkDate(value) {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(value));
  } catch {
    return null;
  }
}

export function journeyClockPath() {
  return (
    process.env.WLBP_JOURNEY_CLOCK_FILE ??
    ".artifacts/booking-journey/fixture-clock.json"
  );
}

export function isPlaywrightCommand(command, commandArgs = []) {
  const cmd = String(command ?? "");
  const args = (commandArgs ?? []).map(String);
  const base = cmd.split(/[\\/]/u).pop() ?? cmd;
  if (/(?:^|\/)playwright(?:\.js)?$/u.test(base)) return true;
  if (/(?:playwright)$/u.test(base)) return true;
  const joined = [base, ...args].join(" ");
  return (
    /(?:^|\s)(pnpm|npm|yarn|npx)(?:\.cmd)?\s+(?:exec|run)?\s*playwright\b/u.test(
      joined,
    ) || /\bplaywright\s+test\b/u.test(joined)
  );
}

export function isIsolatedWorkdir(value) {
  return (
    typeof value === "string" &&
    isAbsolute(value) &&
    value.includes("/.artifacts/") &&
    value.endsWith("/isolated")
  );
}

export function shouldRunJourneyPreflight(phase, command, commandArgs = []) {
  return (
    process.env.WLBP_JOURNEY_E2E === "1" &&
    (phase === "suite" || phase === "navigation") &&
    isPlaywrightCommand(command, commandArgs)
  );
}

function clockError(reason) {
  return new Error(
    `Prepare the isolated journey fixture clock before the browser campaign: ${reason}.`,
  );
}

function parseDatabasePortFromConfig(text) {
  const sectionMatch = text.match(
    /\[db\][ \t]*\r?\n([\s\S]*?)(?=\r?\n\s*\[[^\]]+\][ \t]*\r?\n|\s*$)/u,
  );
  if (!sectionMatch) throw new Error("Supabase config is missing a [db] section.");
  const section = sectionMatch[1];
  const portLines = section
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => /^\s*port\s*=/u.test(line));
  if (portLines.length !== 1)
    throw new Error("Supabase [db] section must declare exactly one port.");
  const valueMatch = portLines[0].match(
    /^\s*port\s*=\s*["']?(\d{4,5})["']?\s*(?:#.*)?$/u,
  );
  if (!valueMatch) throw new Error("Supabase [db] port is malformed.");
  return valueMatch[1];
}

export function selectedCampaignDatabasePort(candidateEnv = process.env) {
  const env = candidateEnv ?? {};
  const workdir = env.WLBP_SUPABASE_WORKDIR;
  let configPort = null;
  if (workdir && isIsolatedWorkdir(workdir)) {
    const configPath = join(workdir, "supabase", "config.toml");
    if (existsSync(configPath)) {
      let text;
      try {
        text = readFileSync(configPath, "utf8");
      } catch {
        throw new Error("Supabase config is unreadable.");
      }
      configPort = parseDatabasePortFromConfig(text);
    }
  }

  const prefix = env.WLBP_CAMPAIGN_PORT_PREFIX;
  let prefixPort = null;
  if (prefix !== undefined && prefix !== "") {
    if (!/^\d{3}$/u.test(prefix)) {
      throw new Error("WLBP_CAMPAIGN_PORT_PREFIX must be exactly three digits.");
    }
    prefixPort = `${prefix}22`;
  }

  if (configPort && prefixPort) {
    if (configPort !== prefixPort) {
      throw new Error(
        `Journey fixture database profile ${configPort} does not match the declared campaign prefix ${prefixPort}.`,
      );
    }
    return configPort;
  }
  if (configPort) return configPort;
  if (prefixPort) return prefixPort;
  throw new Error(
    "No campaign database port can be determined; require an isolated Supabase config [db].port or WLBP_CAMPAIGN_PORT_PREFIX.",
  );
}

export function validateJourneyClock() {
  if (process.env.WLBP_JOURNEY_E2E !== "1") return null;

  const raw = (() => {
    try {
      return readFileSync(journeyClockPath(), "utf8");
    } catch {
      throw clockError("clock file is missing or unreadable");
    }
  })();

  let clock;
  try {
    clock = JSON.parse(raw);
  } catch {
    throw clockError("clock file contains invalid JSON");
  }

  if (!clock || typeof clock !== "object" || Array.isArray(clock))
    throw clockError("clock is not a JSON object");
  if (!Number.isFinite(Date.parse(clock.seededAt)))
    throw clockError("seededAt is not a valid timestamp");
  if (clock.timeZone !== "America/New_York")
    throw clockError("timeZone is not America/New_York");
  if (clock.source !== JOURNEY_CLOCK_SOURCE)
    throw clockError(
      `source must be ${JOURNEY_CLOCK_SOURCE}, received ${String(clock.source)}`,
    );

  const profile = String(clock.databaseProfile ?? "");
  if (!APPROVED_DATABASE_PORTS.has(profile))
    throw new Error(
      "Journey fixture database profile does not match an approved isolated campaign database.",
    );

  if (Date.parse(clock.seededAt) > Date.now())
    throw clockError("seededAt is in the future");

  const workdir = process.env.WLBP_SUPABASE_WORKDIR;
  if (!workdir || !isAbsolute(workdir) || !isIsolatedWorkdir(workdir))
    throw new Error(
      "Explicit absolute isolated campaign workdir required; never use retained/default project.",
    );

  const selectedPort = selectedCampaignDatabasePort(process.env);
  if (!APPROVED_DATABASE_PORTS.has(selectedPort))
    throw new Error(
      "Selected campaign database profile is not an approved isolated campaign database.",
    );
  if (profile !== selectedPort)
    throw new Error(
      `Journey fixture database profile ${profile} does not match the selected campaign database ${selectedPort}.`,
    );

  const today = formatNewYorkDate(Date.now());
  const seededDate = formatNewYorkDate(clock.seededAt);
  if (!today || !seededDate || today !== seededDate)
    throw new Error(
      "Journey fixture clock is not current for the server New York civil date.",
    );

  return clock;
}

export function preflightJourneyClock() {
  return validateJourneyClock();
}
