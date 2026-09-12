import { spawnSync } from "node:child_process";

// Issue #94. The local stack's credentials are generated per machine and per
// run, so they cannot be committed and must not be printed. This reads them
// once, at config load, and hands them straight to the dev servers Playwright
// manages.
//
// A stack that is not running is not an error here: most projects in this suite
// never touch the database, and failing config load would stop all of them.
// The live journey asserts on the environment it needs instead.
export interface LocalSupabaseEnvironment {
  readonly NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?: string;
  readonly NEXT_PUBLIC_SUPABASE_URL?: string;
}

let cached: LocalSupabaseEnvironment | undefined;

export function localSupabaseEnvironment(): LocalSupabaseEnvironment {
  if (cached !== undefined) return cached;

  // An explicit environment wins, so CI can point the suite somewhere else
  // without this file knowing how.
  const fromEnvironment = {
    ...(process.env.NEXT_PUBLIC_SUPABASE_URL === undefined
      ? {}
      : { NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL }),
    ...(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY === undefined
      ? {}
      : {
          NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
            process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
        }),
  };
  if (fromEnvironment.NEXT_PUBLIC_SUPABASE_URL !== undefined) {
    cached = fromEnvironment;
    return cached;
  }

  const status = spawnSync("npx", ["supabase", "status", "-o", "env"], {
    encoding: "utf8",
    // stderr is dropped rather than inherited: the CLI prints connection
    // strings there when it is unhappy.
    stdio: ["ignore", "pipe", "ignore"],
  });
  if (status.status !== 0 || typeof status.stdout !== "string") {
    cached = {};
    return cached;
  }

  const values = new Map<string, string>();
  for (const line of status.stdout.split("\n")) {
    const match = /^([A-Z_]+)="(.*)"$/u.exec(line.trim());
    if (match !== null) values.set(match[1], match[2]);
  }
  const url = values.get("API_URL");
  // The publishable key is the new name; ANON_KEY is what older CLIs emit.
  const key = values.get("PUBLISHABLE_KEY") ?? values.get("ANON_KEY");
  cached =
    url === undefined || key === undefined
      ? {}
      : {
          NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: key,
          NEXT_PUBLIC_SUPABASE_URL: url,
        };
  return cached;
}

/** True when a live journey can run at all. */
export const hasLocalSupabase = (): boolean =>
  localSupabaseEnvironment().NEXT_PUBLIC_SUPABASE_URL !== undefined;
