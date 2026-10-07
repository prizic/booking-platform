import { createOnboardingLink } from "./provider.ts";
const intent = {
  account_reference: "acct_synthetic",
  return_url: "https://dashboard.example.invalid/en/integrations?onboarding=return",
  refresh_url: "https://dashboard.example.invalid/en/integrations?onboarding=refresh",
  idempotency_key: "onboarding:synthetic",
};
Deno.test(
  "provider link uses authoritative mapping and a stable retry key",
  async () => {
    let calls = 0;
    const transport: typeof fetch = async (_url, options) => {
      calls++;
      if (
        new Headers(options?.headers).get("idempotency-key") !== intent.idempotency_key
      )
        throw new Error("unstable key");
      const body = options?.body;
      if (
        !(body instanceof URLSearchParams) ||
        body.get("account") !== intent.account_reference ||
        body.get("return_url") !== intent.return_url
      )
        throw new Error("wrong mapping");
      return Response.json({ url: "https://connect.stripe.com/setup/synthetic" });
    };
    for (let i = 0; i < 2; i++) {
      if (
        (await createOnboardingLink(intent, "synthetic-test-value", transport)) !==
        "https://connect.stripe.com/setup/synthetic"
      )
        throw new Error("missing destination");
    }
    if (calls !== 2) throw new Error("retry not exercised");
  },
);
Deno.test("provider failures and unsafe destinations are refused", async () => {
  for (const url of [
    "http://connect.stripe.com/setup",
    "https://attacker.example.invalid/setup",
    "https://user:pass@connect.stripe.com/setup",
  ]) {
    if (
      (await createOnboardingLink(intent, "synthetic-test-value", async () =>
        Response.json({ url }),
      )) !== null
    )
      throw new Error("unsafe redirect");
  }
  if (
    (await createOnboardingLink(
      { ...intent, return_url: "javascript:alert(1)" },
      "synthetic-test-value",
      async () => {
        throw new Error("must not call provider");
      },
    )) !== null
  )
    throw new Error("unsafe origin");
  if (
    (await createOnboardingLink(
      intent,
      "synthetic-test-value",
      async () => new Response(null, { status: 503 }),
    )) !== null
  )
    throw new Error("false provider success");
});
