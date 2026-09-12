// Issue #101. One way to call the platform's own Data API, so four functions do
// not each invent their own.
//
// Every entry point here runs as `service_role`, which bypasses row level
// security. That is exactly why the surface it may call is narrow and named:
// the functions in `api_v1` granted to `service_role` and nothing else.
const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

export const platformConfigured = (): boolean =>
  supabaseUrl !== "" && serviceRoleKey !== "";

export async function callRpc<T>(
  name: string,
  parameters: Readonly<Record<string, unknown>>,
): Promise<readonly T[] | null> {
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/${name}`, {
    body: JSON.stringify(parameters),
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      "content-type": "application/json",
    },
    method: "POST",
  });
  // A failure is null rather than a throw: every caller here has to decide
  // whether to retry, and an exception would make that decision for them.
  if (!response.ok) return null;
  const body = (await response.json()) as unknown;
  return (Array.isArray(body) ? body : [body]) as readonly T[];
}

/** Configuration is missing. A 500 keeps the caller retrying until it is not. */
export const unconfigured = (): Response =>
  new Response(JSON.stringify({ error: "unconfigured" }), {
    headers: { "cache-control": "no-store", "content-type": "application/json" },
    status: 500,
  });

export const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    headers: { "cache-control": "no-store", "content-type": "application/json" },
    status,
  });
