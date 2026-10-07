import { renderNotificationEmail } from "../_shared/email/templates.ts";
import {
  callRpc,
  isInternalInvocation,
  json,
  platformConfigured,
  unauthorized,
  unconfigured,
} from "../_shared/rpc.ts";

interface Delivery {
  job_id: string;
  attempt: number;
  invitation_id: string;
  recipient_email: string;
  dashboard_hostname: string;
  brand_name: string;
}

/** Provider responses and Auth link material never enter logs or durable rows. */
async function sendInvitation(job: Delivery): Promise<boolean> {
  const root = Deno.env.get("SUPABASE_URL") ?? "";
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const origin = new URL(`https://${job.dashboard_hostname}`);
  if (
    origin.hostname !== job.dashboard_hostname ||
    origin.username ||
    origin.password ||
    origin.port
  )
    return false;
  const headers = {
    apikey: key,
    authorization: `Bearer ${key}`,
    "content-type": "application/json",
  };
  const generate = async (type: string) =>
    fetch(`${root}/auth/v1/admin/generate_link`, {
      method: "POST",
      headers,
      body: JSON.stringify({ type, email: job.recipient_email }),
    });
  let response = await generate("invite");
  if (!response.ok) {
    const failure = (await response.json()) as { error_code?: string; code?: string };
    if (
      failure.error_code !== "email_exists" &&
      failure.code !== "email_exists" &&
      failure.error_code !== "user_already_exists"
    )
      return false;
    response = await generate("magiclink");
  }
  if (!response.ok) return false;
  const result = (await response.json()) as {
    hashed_token?: unknown;
    verification_type?: unknown;
    properties?: { hashed_token?: unknown; verification_type?: unknown };
  };
  const token = result.hashed_token ?? result.properties?.hashed_token;
  const type = result.verification_type ?? result.properties?.verification_type;
  if (
    typeof token !== "string" ||
    token.length > 2048 ||
    (type !== "invite" && type !== "magiclink")
  )
    return false;
  const link = new URL("/auth/invitation", origin);
  link.searchParams.set("token_hash", token);
  link.searchParams.set("type", type);
  link.searchParams.set("invitation", job.invitation_id);
  const english = renderNotificationEmail("auth.sign_in_link", {
    brandName: job.brand_name,
    locale: "en",
    variables: { actionUrl: link.toString() },
  });
  const arabic = renderNotificationEmail("auth.sign_in_link", {
    brandName: job.brand_name,
    locale: "ar",
    variables: { actionUrl: link.toString() },
  });
  const sent = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${Deno.env.get("RESEND_API_KEY") ?? ""}`,
      "content-type": "application/json",
      "Idempotency-Key": `staff-invitation:${job.job_id}:${job.attempt}`,
    },
    body: JSON.stringify({
      from: Deno.env.get("NOTIFICATION_SENDER"),
      to: [job.recipient_email],
      subject: `${english.subject} · ${arabic.subject}`,
      html: `${english.html}${arabic.html}`,
      text: `${english.text}\n\n${arabic.text}`,
    }),
  });
  return sent.ok;
}

Deno.serve(async (request: Request): Promise<Response> => {
  if (request.method !== "POST" || !isInternalInvocation(request))
    return unauthorized();
  if (
    !platformConfigured() ||
    !Deno.env.get("RESEND_API_KEY") ||
    !Deno.env.get("NOTIFICATION_SENDER")
  )
    return unconfigured();
  const jobs = await callRpc<Delivery>("claim_staff_invitation_delivery_v1", {});
  if (jobs === null) return json({ error: "claim_failed" }, 503);
  const job = jobs[0];
  if (!job) return json({ claimed: 0 });
  let sent = false;
  try {
    sent = await sendInvitation(job);
  } catch {
    /* The lease makes this retryable without logging secrets. */
  }
  const recorded = await callRpc<boolean>("complete_staff_invitation_delivery_v1", {
    p_job_id: job.job_id,
    p_attempt: job.attempt,
    p_sent: sent,
  });
  return json(
    { claimed: 1, sent, recorded: recorded?.[0] === true },
    recorded === null ? 503 : 200,
  );
});
