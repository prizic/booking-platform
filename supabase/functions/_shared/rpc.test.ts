import { isInternalInvocation, platformConfigured } from "./rpc.ts";

Deno.test(
  "internal worker invocation requires the current service-role bearer credential",
  () => {
    const originalUrl = Deno.env.get("SUPABASE_URL");
    const originalServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    try {
      Deno.env.set("SUPABASE_URL", "https://example.supabase.co");
      Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "service-role-test-key");

      if (!platformConfigured()) throw new Error("expected configured platform");
      if (
        isInternalInvocation(
          new Request("https://example.invalid", {
            headers: { Authorization: "Bearer user-access-token" },
          }),
        )
      ) {
        throw new Error("ordinary user bearer token was accepted");
      }
      if (
        !isInternalInvocation(
          new Request("https://example.invalid", {
            headers: { Authorization: "Bearer service-role-test-key" },
          }),
        )
      ) {
        throw new Error("service role bearer credential was refused");
      }
    } finally {
      if (originalUrl === undefined) Deno.env.delete("SUPABASE_URL");
      else Deno.env.set("SUPABASE_URL", originalUrl);
      if (originalServiceRoleKey === undefined) {
        Deno.env.delete("SUPABASE_SERVICE_ROLE_KEY");
      } else {
        Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", originalServiceRoleKey);
      }
    }
  },
);
