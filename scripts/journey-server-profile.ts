// Central, typed definitions for the server stacks that Playwright starts for each
// journey profile. Keep these arrays as the single source of truth so every
// profile visibly declares which applications/ports it starts and can be tested
// without changing Playwright execution behaviour.

export type JourneyServer = {
  readonly label: string;
  readonly command: string;
  readonly port: number;
  readonly reuseExistingServer: boolean;
  readonly url?: string;
  readonly timeoutMs?: number;
};

const reuseDevServersInCi = Boolean(process.env.CI);

export const defaultServers: readonly JourneyServer[] = [
  {
    label: "client-default",
    command: "pnpm --filter @wlbp/client exec next dev --port 41730",
    port: 41730,
    reuseExistingServer: reuseDevServersInCi,
  },
  {
    label: "dashboard-default",
    command: "pnpm --filter @wlbp/dashboard exec next dev --port 41731",
    port: 41731,
    reuseExistingServer: reuseDevServersInCi,
  },
  {
    label: "platform-admin-public-smoke",
    command: "pnpm --filter @wlbp/platform-admin exec next dev --port 41732",
    port: 41732,
    reuseExistingServer: reuseDevServersInCi,
  },
  {
    label: "client-warm-brand",
    command:
      "WLBP_BRAND_CONFIG_PATH=tests/e2e/fixtures/warm-brand.json WLBP_NEXT_DIST_DIR=.next-warm-client pnpm --filter @wlbp/client exec next dev --port 41733",
    port: 41733,
    reuseExistingServer: reuseDevServersInCi,
  },
  {
    label: "dashboard-warm-brand",
    command:
      "WLBP_BRAND_CONFIG_PATH=tests/e2e/fixtures/warm-brand.json WLBP_NEXT_DIST_DIR=.next-warm-dashboard pnpm --filter @wlbp/dashboard exec next dev --port 41734",
    port: 41734,
    reuseExistingServer: reuseDevServersInCi,
  },
] as const;

export const completionServers: readonly JourneyServer[] = [
  {
    label: "client-completion",
    command:
      "WLBP_NEXT_DIST_DIR=.next-completion-client node scripts/run-with-local-supabase-env.mjs client.dashboard-completion.example.invalid pnpm --filter @wlbp/client exec next dev --port 41730",
    port: 41730,
    reuseExistingServer: false,
  },
  {
    label: "dashboard-completion",
    command:
      "WLBP_NEXT_DIST_DIR=.next-completion-dashboard node scripts/run-with-local-supabase-env.mjs dashboard.dashboard-completion.example.invalid pnpm --filter @wlbp/dashboard exec next dev --port 41731",
    port: 41731,
    reuseExistingServer: false,
    url: "http://localhost:41731/en/auth/sign-in",
  },
  {
    label: "dashboard-completion-warm",
    command:
      "WLBP_BRAND_CONFIG_PATH=tests/e2e/fixtures/warm-brand.json WLBP_NEXT_DIST_DIR=.next-completion-warm node scripts/run-with-local-supabase-env.mjs dashboard.dashboard-completion.example.invalid pnpm --filter @wlbp/dashboard exec next dev --port 41734",
    port: 41734,
    reuseExistingServer: false,
    url: "http://localhost:41734/en/auth/sign-in",
  },
] as const;

export const journeyServers: readonly JourneyServer[] = [
  ...completionServers,
  {
    label: "client-journey-warm",
    command:
      "WLBP_BRAND_CONFIG_PATH=tests/e2e/fixtures/warm-brand.json WLBP_NEXT_DIST_DIR=.next-journey-warm-client node scripts/run-with-local-supabase-env.mjs client.dashboard-completion.example.invalid pnpm --filter @wlbp/client exec next dev --port 41733",
    port: 41733,
    reuseExistingServer: false,
  },
  {
    label: "client-journey-other-tenant",
    command:
      "WLBP_NEXT_DIST_DIR=.next-journey-other node scripts/run-with-local-supabase-env.mjs client.tenant-b.example.invalid pnpm --filter @wlbp/client exec next dev --port 41735",
    port: 41735,
    reuseExistingServer: false,
  },
  {
    label: "platform-admin-public-smoke",
    command: "pnpm --filter @wlbp/platform-admin exec next dev --port 41732",
    port: 41732,
    reuseExistingServer: false,
  },
  {
    label: "client-journey-fault",
    command:
      "node scripts/journey-fault-server.mjs client client.dashboard-completion.example.invalid 41736",
    port: 41736,
    reuseExistingServer: false,
  },
  {
    label: "dashboard-journey-fault",
    command:
      "node scripts/journey-fault-server.mjs dashboard dashboard.dashboard-completion.example.invalid 41737",
    port: 41737,
    reuseExistingServer: false,
  },
] as const;

export const liveBookingServers: readonly JourneyServer[] = [
  {
    label: "client-live-booking",
    command:
      "WLBP_NEXT_DIST_DIR=.next-live-client node scripts/run-with-local-supabase-env.mjs client.live-booking.example.invalid pnpm --filter @wlbp/client exec next dev --port 41730",
    port: 41730,
    reuseExistingServer: false,
  },
  {
    label: "dashboard-live-booking",
    command:
      "WLBP_NEXT_DIST_DIR=.next-live-dashboard node scripts/run-with-local-supabase-env.mjs dashboard.live-booking.example.invalid pnpm --filter @wlbp/dashboard exec next dev --port 41731",
    port: 41731,
    reuseExistingServer: false,
    url: "http://localhost:41731/en/auth/sign-in",
  },
] as const;

// Composed accessibility stack: the full journey servers plus the isolated admin
// instance that admin accessibility specs require. Keep 41732 declared once.
export const a11yServers: readonly JourneyServer[] = [
  ...journeyServers,
  {
    label: "platform-admin-isolated-a11y",
    command: "node scripts/platform-admin-local.mjs serve --port 41742 --foreground",
    port: 41742,
    reuseExistingServer: false,
  },
] as const;

// Composed platform-admin stacks. Admin fault (41743) is optional and only
// added by the config for journey runs.
export const platformAdminServers: readonly JourneyServer[] = [
  {
    label: "platform-admin-isolated",
    command: "node scripts/platform-admin-local.mjs serve --port 41742 --foreground",
    port: 41742,
    reuseExistingServer: false,
  },
] as const;

export const platformAdminFaultServers: readonly JourneyServer[] = [
  ...platformAdminServers,
  {
    label: "platform-admin-fault",
    command: "node scripts/journey-fault-server.mjs admin platform-admin.local 41743",
    port: 41743,
    reuseExistingServer: false,
  },
] as const;
export function duplicatePorts(servers: readonly JourneyServer[]): number[] {
  const seen = new Map<number, number>();
  const duplicates: number[] = [];
  for (const server of servers) {
    const count = seen.get(server.port) ?? 0;
    if (count > 0 && !duplicates.includes(server.port)) duplicates.push(server.port);
    seen.set(server.port, count + 1);
  }
  return duplicates;
}

export function assertUniquePorts(servers: readonly JourneyServer[]): void {
  const duplicates = duplicatePorts(servers);
  if (duplicates.length > 0) {
    throw new Error(`Duplicate Playwright server ports: ${duplicates.join(", ")}`);
  }
}

// No unsafe detail helper here. Playwright failure diagnostics are limited to the
// labels, ports and bounded command metadata in the profile above.
