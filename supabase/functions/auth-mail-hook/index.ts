// Issue #101. The Supabase Send Email Hook.
//
// Auth mail is the one message the platform sends on behalf of a tenant to
// somebody who may not be that tenant's customer yet, which makes "which brand
// signs this" a question with a wrong answer. It is resolved from our own
// membership and invitation records through `resolve_auth_mail_context_v1` —
// never from user metadata, a redirect URL, or a claimed hostname, none of
// which the recipient's own browser had to earn.
//
// An address that matches nothing, or matches more than one tenant, gets a
// generic message. Saying "we could not tell which of your two organizations
// this is" would answer a question the sender never had to prove they may ask.
import {
  renderNotificationEmail,
  type NotificationTemplateKey,
} from "../_shared/email/templates.ts";
import { verifyResendWebhook } from "../_shared/email/webhook.ts";
import { callRpc, json, platformConfigured, unconfigured } from "../_shared/rpc.ts";

// Supabase names six actions; this product sends three messages. A type we do
// not recognise is refused rather than mailed under a guessed heading.
const templateForAction: Readonly<Record<string, NotificationTemplateKey>> = {
  email_change: "auth.email_change",
  invite: "auth.sign_in_link",
  magiclink: "auth.sign_in_link",
  reauthentication: "auth.sign_in_link",
  recovery: "auth.password_reset",
  signup: "auth.sign_in_link",
};

const hookSecret = Deno.env.get("SEND_EMAIL_HOOK_SECRET") ?? "";
const resendApiKey = Deno.env.get("RESEND_API_KEY") ?? "";
const sender = Deno.env.get("NOTIFICATION_SENDER") ?? "";
const platformName = Deno.env.get("NOTIFICATION_BRAND_NAME") ?? "Booking";

const refused = (): Response => json({ error: "invalid_request" }, 400);

interface MailContext {
  readonly ambiguous: boolean;
  readonly brand_name: string | null;
  readonly tenant_id: string | null;
}

Deno.serve(async (request: Request): Promise<Response> => {
  if (request.method !== "POST") return refused();
  if (
    !platformConfigured() ||
    hookSecret === "" ||
    resendApiKey === "" ||
    sender === ""
  ) {
    return unconfigured();
  }

  // Supabase signs the hook the same way Resend does, over the same raw bytes.
  const rawBody = await request.text();
  const verification = await verifyResendWebhook({
    headers: {
      "webhook-id": request.headers.get("webhook-id"),
      "webhook-signature": request.headers.get("webhook-signature"),
      "webhook-timestamp": request.headers.get("webhook-timestamp"),
    },
    rawBody,
    secret: hookSecret,
  });
  if (!verification.ok) return refused();

  let hook: {
    email_data?: {
      email_action_type?: unknown;
      token_hash?: unknown;
      redirect_to?: unknown;
    };
    user?: { email?: unknown };
  };
  try {
    hook = JSON.parse(rawBody) as typeof hook;
  } catch {
    return refused();
  }
  const recipient = typeof hook.user?.email === "string" ? hook.user.email : "";
  const action =
    typeof hook.email_data?.email_action_type === "string"
      ? hook.email_data.email_action_type
      : "";
  const tokenHash =
    typeof hook.email_data?.token_hash === "string" ? hook.email_data.token_hash : "";
  if (recipient === "" || action === "" || tokenHash === "") return refused();

  const context = await callRpc<MailContext>("resolve_auth_mail_context_v1", {
    p_email: recipient,
  });
  if (context === null) return json({ error: "not_resolved" }, 500);
  const resolved = context[0];
  // Generic unless we can name exactly one tenant. Branding an ambiguous
  // address would tell the sender which organizations own it.
  const brandName =
    resolved !== undefined && !resolved.ambiguous && resolved.brand_name !== null
      ? resolved.brand_name
      : platformName;

  // The link is built from the platform's own verification endpoint and the
  // token hash, never from a redirect the payload asked for.
  const siteUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const link =
    `${siteUrl}/auth/v1/verify?token=${encodeURIComponent(tokenHash)}` +
    `&type=${encodeURIComponent(action)}`;

  // Both languages, in one message. The hook carries no locale and the
  // recipient may have no account yet, so guessing would be worse than sending
  // the message twice in the body. Copy and direction come from the tested
  // platform templates, not from anything written here.
  const template = templateForAction[action];
  if (template === undefined) return refused();
  const english = renderNotificationEmail(template, {
    brandName,
    locale: "en",
    variables: { actionUrl: link },
  });
  const arabic = renderNotificationEmail(template, {
    brandName,
    locale: "ar",
    variables: { actionUrl: link },
  });

  const response = await fetch("https://api.resend.com/emails", {
    body: JSON.stringify({
      from: sender,
      html: `${english.html}${arabic.html}`,
      subject: `${english.subject} · ${arabic.subject}`,
      text: `${english.text}\n\n${arabic.text}\n`,
      to: [recipient],
    }),
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
      // The token hash is single-use, so it is also the natural idempotency key.
      "Idempotency-Key": tokenHash,
    },
    method: "POST",
  });
  if (!response.ok) return json({ error: "not_sent" }, 500);
  return json({ sent: true });
});
