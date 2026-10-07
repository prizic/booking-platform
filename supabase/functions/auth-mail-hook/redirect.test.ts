import { recoveryRedirect } from "./redirect.ts";
Deno.test("recovery only returns to an explicitly configured callback", () => {
  const origin = "https://dashboard.example.invalid";
  if (
    recoveryRedirect(`${origin}/auth/callback?locale=ar`, origin) !==
    `${origin}/auth/callback?locale=ar`
  )
    throw new Error("Expected allowed callback");
  for (const input of [
    `${origin}/auth/callback?next=https://evil.invalid`,
    `${origin}/auth/callback?code=secret`,
    `${origin}/auth/callback#secret`,
    `${origin}/anything`,
    "https://evil.invalid/auth/callback",
    "//evil.invalid/auth/callback",
  ])
    if (recoveryRedirect(input, origin) !== null)
      throw new Error("Unsafe callback accepted");
});
