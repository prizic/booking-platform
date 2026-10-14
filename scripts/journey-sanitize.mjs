// Deliberately lossy diagnostics: no assertion DOM, payloads, cookies or tokens.
export function safeUrl(value) {
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol)) return "[redacted URL]";
    const path = url.pathname
      .split("/")
      .map((part) =>
        /^(?:en|ar|auth|sign-in|login|services|about|contact|find-booking|bookings|customers|requests|manage|cancel|reschedule|tenants|instances|jobs|plans|review|domains|provisioning|calendar|resources|team|availability|payments|communications|reports|brand|settings|audit|integrations|releases|subscriptions|operators|health|support|rollouts|account|new|categories|resource-types|roles|invites|notifications|privacy)$/u.test(
          part,
        ) || part === ""
          ? part
          : "[record]",
      )
      .join("/");
    return `${url.origin}${path}`;
  } catch {
    return "[unavailable URL]";
  }
}

export function sanitize(value) {
  return (
    String(value ?? "")
      // The ESC control character is the match target for stripping ANSI colour.
      // eslint-disable-next-line no-control-regex
      .replace(/\u001b\[[0-9;]*m/gu, "")
      .replace(/\/Users\/[^/\s]+\//gu, "[home]/")
      .replace(/(?:https?|postgres(?:ql)?):\/\/[^\s<>"']+/gu, (url) => safeUrl(url))
      // Relative request URLs can occur in assertion messages and stack frames.
      // Redact every query/fragment, even when the credential parameter is unnamed.
      .replace(/\/[\w%./[\]-]+[?#][^\s<>"'`]*/gu, (url) =>
        safeUrl(`http://diagnostic.invalid${url}`).replace(
          "http://diagnostic.invalid",
          "",
        ),
      )
      .replace(/[\w.+-]+@[\w.-]+/gu, "[email]")
      .replace(/\beyJ[A-Za-z0-9_.-]+/gu, "[credential]")
      .replace(
        /\b(?:sb_secret_|sb_publishable_|sk_|pk_)[A-Za-z0-9_-]+/gu,
        "[credential]",
      )
      .replace(/\b[a-f\d]{24,}\b/giu, "[token]")
      .replace(/\b[\w-]{32,}\b/gu, "[opaque]")
      .replace(/\+?\d[\d ()-]{5,}\d/gu, "[number]")
      .replace(/\b[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\b/giu, "[record]")
      .replace(/(["'`])[^\n]*?\1/gu, "[quoted value]")
      .replace(
        /(?:password|secret|authorization|cookie|otp|code|token|session|email|phone|intake|customer)(?:\s*[:=]\s*)[^\n]*/giu,
        "[sensitive field]",
      )
      .slice(0, 500)
  );
}

export function safeFailure(error, title, url) {
  const lines = String(error?.message ?? error ?? "Failure").split("\n");
  const first = lines.find((line) => line.trim()) ?? "Failure";
  const diagnosticLines = [first];
  for (const line of lines) {
    if (
      /expected|received|to be visible|locator/iu.test(line) &&
      line.trim() !== first.trim()
    ) {
      diagnosticLines.push(line.trim());
    }
    if (diagnosticLines.length >= 4) break;
  }
  const frame = String(error?.stack ?? "")
    .split("\n")
    .find((line) => /^\s*at /u.test(line));
  return {
    title: sanitize(title),
    error: sanitize(
      diagnosticLines
        // Playwright quotes scalar expectations, which `sanitize` already
        // redacts; an unquoted multi-token Expected/Received value is a captured
        // body or DOM dump, so drop it whole instead of emitting page content.
        .map((line) =>
          line.replace(
            /\b(expected|received)(\s*:\s*)(.+)$/iu,
            (match, label, separator, value) =>
              /\s/u.test(value.trim()) ? `${label}${separator}[value]` : match,
          ),
        )
        .join(" | "),
    ),
    firstStackFrame: sanitize(frame ?? ""),
    url: safeUrl(url),
  };
}
