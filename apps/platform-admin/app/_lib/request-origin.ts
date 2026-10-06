/** Host represents the public request authority; Next's internal URL may use its bind address. */
export function publicRequestOrigin(url: string, headers: Headers): string {
  const parsed = new URL(url);
  const host = headers.get("host");
  if (!host || /[\s/\\@?#]/u.test(host)) return parsed.origin;
  try {
    return new URL(`${parsed.protocol}//${host}`).origin;
  } catch {
    return parsed.origin;
  }
}

export function isSameOriginPost(url: string, headers: Headers): boolean {
  const origin = headers.get("origin");
  if (origin !== null) return origin === publicRequestOrigin(url, headers);
  return headers.get("sec-fetch-site") !== "cross-site";
}
