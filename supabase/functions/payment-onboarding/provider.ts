export async function createOnboardingLink(
  intent: {
    account_reference: string;
    return_url: string;
    refresh_url: string;
    idempotency_key: string;
  },
  secret: string,
  transport: typeof fetch = fetch,
): Promise<string | null> {
  if (!/^acct_[A-Za-z0-9]+$/u.test(intent.account_reference) || !secret) return null;
  for (const raw of [intent.return_url, intent.refresh_url]) {
    try {
      const url = new URL(raw);
      if (url.protocol !== "https:" || url.username || url.password || url.hash)
        return null;
    } catch {
      return null;
    }
  }
  try {
    const response = await transport("https://api.stripe.com/v1/account_links", {
      method: "POST",
      headers: {
        authorization: `Bearer ${secret}`,
        "content-type": "application/x-www-form-urlencoded",
        "idempotency-key": intent.idempotency_key,
      },
      body: new URLSearchParams({
        account: intent.account_reference,
        type: "account_onboarding",
        return_url: intent.return_url,
        refresh_url: intent.refresh_url,
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) return null;
    const body: unknown = await response.json();
    if (
      typeof body !== "object" ||
      body === null ||
      !("url" in body) ||
      typeof body.url !== "string"
    )
      return null;
    const url = new URL(body.url);
    return url.protocol === "https:" &&
      url.hostname === "connect.stripe.com" &&
      !url.username &&
      !url.password &&
      !url.hash
      ? url.href
      : null;
  } catch {
    return null;
  }
}
