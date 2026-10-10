// ADR-0018. The WhatsApp outbox worker's decisions, behind injected ports so
// Deno tests run them with no network, no database and no secret.
//
// Semantics mirror `notification-worker`: claim a bounded batch under a
// visibility timeout, try each message once, and record every attempt. The
// database owns the retry schedule; this file only says "accepted",
// "retryable_error" or "permanent_error". A worker killed mid-batch loses
// nothing: the visibility timeout expires and the message is claimed again.
import {
  resolveWhatsAppAccessToken,
  sendWhatsAppTemplate,
  type WhatsAppDeliveryReport,
  type WhatsAppTransport,
} from "../_shared/whatsapp/mod.ts";

/**
 * One row from `claim_whatsapp_batch_v1`. ASSUMED shape (DB agent owns the
 * function): the email claim's columns, with the phone in place of the email,
 * plus the tenant's configuration resolved for this message's template key so
 * the worker needs no second, broader read.
 */
export interface ClaimedWhatsAppRow {
  readonly access_token_secret_ref: string | null;
  readonly attempt: number;
  readonly correlation_id: string;
  readonly message_id: string;
  readonly payload: Record<string, unknown> | null;
  readonly phone_number_id: string | null;
  readonly recipient_phone_e164: string;
  readonly template_key: string;
  readonly template_language: string | null;
  readonly template_locale: string;
  readonly template_name: string | null;
  readonly tenant_id: string;
}

export interface RecordedAttempt {
  readonly attempt: number;
  readonly messageId: string;
  readonly report: WhatsAppDeliveryReport;
  readonly startedAt: string;
}

export interface WhatsAppWorkerPorts {
  /** Current claim, consent and customer identity must still be live. */
  readonly authorize: (row: ClaimedWhatsAppRow) => Promise<boolean>;
  readonly claim: () => Promise<readonly ClaimedWhatsAppRow[]>;
  /** Only this decides whether sending is over. */
  readonly record: (attempt: RecordedAttempt) => Promise<void>;
  /** The tenant's published brand name in the message locale, or null. */
  readonly resolveBrandName: (
    tenantId: string,
    locale: "ar" | "en",
  ) => Promise<string | null>;
  /** Reads a platform Edge Function secret by name. */
  readonly readSecret: (name: string) => string | undefined;
  readonly transport: WhatsAppTransport;
}

export interface WhatsAppBatchSummary {
  readonly accepted: number;
  readonly failed: number;
  readonly retried: number;
}

/** Outbox payload values are strings already localized by the database. */
function stringVariables(
  payload: Record<string, unknown> | null,
): Record<string, string> {
  const variables: Record<string, string> = {};
  for (const [key, value] of Object.entries(payload ?? {})) {
    if (typeof value === "string") variables[key] = value;
    else if (typeof value === "number" && Number.isFinite(value))
      variables[key] = String(value);
  }
  return variables;
}

const permanent = (errorCode: string): WhatsAppDeliveryReport => ({
  category: "configuration",
  errorCode,
  outcome: "permanent_error",
});

async function deliver(
  row: ClaimedWhatsAppRow,
  ports: WhatsAppWorkerPorts,
  resolveBrandName: (tenantId: string, locale: "ar" | "en") => Promise<string | null>,
): Promise<WhatsAppDeliveryReport> {
  if (row.template_name === null || row.template_name === "") {
    return permanent("template_unmapped");
  }
  if (row.phone_number_id === null || row.phone_number_id === "") {
    return permanent("phone_number_unconfigured");
  }

  const token = resolveWhatsAppAccessToken(
    row.tenant_id,
    row.access_token_secret_ref,
    ports.readSecret,
  );
  if (!token.ok) {
    // A reference that names somebody else's secret, or a Vault reference this
    // worker does not resolve, never becomes valid; one that is merely unset
    // may be set by the operator before retries run out.
    if (token.reason === "reference_invalid")
      return permanent("token_reference_invalid");
    if (token.reason === "reference_unsupported") {
      return permanent("token_reference_unsupported");
    }
    return {
      category: "configuration",
      errorCode: "token_unresolved",
      outcome: "retryable_error",
    };
  }

  const locale = row.template_locale === "ar" ? "ar" : "en";
  const variables = stringVariables(row.payload);
  if (variables["brandName"] === undefined || variables["brandName"] === "") {
    // Never a platform default: a message signed with our name instead of the
    // tenant's is the one mistake a white-label product cannot make. A brand
    // that cannot be resolved leaves the message for the next attempt.
    const brandName = await resolveBrandName(row.tenant_id, locale);
    if (brandName === null || brandName === "") {
      return {
        category: "transient",
        errorCode: "brand_unresolved",
        outcome: "retryable_error",
      };
    }
    variables["brandName"] = brandName;
  }

  if (!(await ports.authorize(row))) return permanent("recipient_unavailable");

  return sendWhatsAppTemplate(
    {
      languageCode: row.template_language ?? locale,
      phoneNumberId: row.phone_number_id,
      recipientE164: row.recipient_phone_e164,
      templateKey: row.template_key,
      templateName: row.template_name,
      variables,
    },
    token.token,
    ports.transport,
  );
}

export async function runWhatsAppBatch(
  ports: WhatsAppWorkerPorts,
): Promise<WhatsAppBatchSummary> {
  const claimed = await ports.claim();
  let accepted = 0;
  let failed = 0;
  let retried = 0;

  // One brand lookup per tenant per batch, not one per message — the same
  // memo the email worker uses. Keyed by tenant *and* locale, so an Arabic and
  // an English message in one batch each get their own name.
  const brands = new Map<string, Promise<string | null>>();
  const brandOf = (tenantId: string, locale: "ar" | "en") => {
    const key = `${tenantId}:${locale}`;
    let pending = brands.get(key);
    if (pending === undefined) {
      pending = ports.resolveBrandName(tenantId, locale).catch(() => null);
      brands.set(key, pending);
    }
    return pending;
  };

  for (const row of claimed) {
    const startedAt = new Date().toISOString();
    let report: WhatsAppDeliveryReport;
    try {
      report = await deliver(row, ports, brandOf);
    } catch {
      // Only a port can throw here (brand lookup). Treat it as transient; the
      // error itself is not logged because it may carry request context.
      report = {
        category: "unknown",
        errorCode: "worker_error",
        outcome: "retryable_error",
      };
    }

    await ports.record({
      attempt: row.attempt,
      messageId: row.message_id,
      report,
      startedAt,
    });
    if (report.outcome === "accepted") accepted += 1;
    else if (report.outcome === "retryable_error") retried += 1;
    else failed += 1;
  }

  return { accepted, failed, retried };
}
