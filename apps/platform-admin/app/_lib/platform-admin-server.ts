import "server-only";

import { parsePublicRuntimeConfig, type RuntimeEnvironment } from "@wlbp/config";
import { createRequestScopedSupabaseClient } from "@wlbp/supabase-client/server";
import { getVerifiedIdentity, type VerifiedIdentity } from "@wlbp/auth";
import { cookies } from "next/headers";

function runtimeEnvironment(): RuntimeEnvironment {
  const configured = process.env.WLBP_RUNTIME_ENV;
  if (
    configured === "local" ||
    configured === "test" ||
    configured === "development" ||
    configured === "preview" ||
    configured === "production"
  ) {
    return configured;
  }
  return process.env.NODE_ENV === "production" ? "production" : "development";
}

export function getPlatformAdminRuntimeConfiguration() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) return null;

  return parsePublicRuntimeConfig({
    environment: runtimeEnvironment(),
    supabasePublishableKey: publishableKey,
    supabaseUrl: url,
  });
}

export async function createPlatformAdminRequestClient() {
  const configuration = getPlatformAdminRuntimeConfiguration();
  if (configuration === null) return null;
  const cookieStore = await cookies();
  return createRequestScopedSupabaseClient(
    {
      publishableKey: configuration.supabasePublishableKey,
      url: configuration.supabaseUrl,
    },
    {
      getAll: () => cookieStore.getAll(),
      setAll: async (values) => {
        for (const cookie of values) {
          cookieStore.set(cookie.name, cookie.value, cookie.options);
        }
      },
    },
  );
}

export type OperatorSessionState =
  | { kind: "configuration-missing" }
  | { kind: "signed-out" }
  | { kind: "mfa-enrollment-required"; identity: VerifiedIdentity }
  | { kind: "step-up-required"; identity: VerifiedIdentity }
  | { kind: "ready"; identity: VerifiedIdentity };

/**
 * One place that decides where an operator stands: signed out, needs to
 * enroll a second factor, needs a fresh AAL2 challenge, or is fully ready.
 * Pages redirect on this instead of each re-deriving it from raw claims.
 */
export async function loadOperatorSession(): Promise<{
  client: Awaited<ReturnType<typeof createPlatformAdminRequestClient>>;
  state: OperatorSessionState;
}> {
  const client = await createPlatformAdminRequestClient();
  if (client === null) return { client, state: { kind: "configuration-missing" } };

  const identity = await getVerifiedIdentity(client);
  if (identity === null) return { client, state: { kind: "signed-out" } };

  if (identity.assuranceLevel === "aal1") {
    const { data } = await client.auth.mfa.listFactors();
    const hasVerifiedFactor = (data?.totp ?? []).some(
      (factor) => factor.status === "verified",
    );
    return {
      client,
      state: hasVerifiedFactor
        ? { kind: "step-up-required", identity }
        : { kind: "mfa-enrollment-required", identity },
    };
  }

  return { client, state: { kind: "ready", identity } };
}
