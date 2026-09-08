import { renderNotificationEmail, type NotificationTemplateKey } from "./templates.js";

export interface ClaimedNotification {
  readonly attempt: number;
  readonly bookingRevision: number;
  readonly correlationId: string;
  readonly locale: "ar" | "en";
  readonly messageId: string;
  readonly payload: Readonly<Record<string, string>>;
  readonly recipient: string;
  readonly templateKey: NotificationTemplateKey;
  readonly tenantId: string;
}

export type DeliveryOutcome = "accepted" | "permanent_error" | "retryable_error";

export interface DeliveryReport {
  readonly errorCode?: string;
  readonly outcome: DeliveryOutcome;
  readonly providerReference?: string;
}

export interface NotificationPorts {
  /** Claims a bounded batch under a visibility timeout. */
  readonly claim: () => Promise<readonly ClaimedNotification[]>;
  readonly deliver: (input: {
    readonly html: string;
    readonly idempotencyKey: string;
    readonly subject: string;
    readonly text: string;
    readonly to: string;
  }) => Promise<DeliveryReport>;
  /** Records the attempt durably. Only this decides whether sending is over. */
  readonly record: (input: {
    readonly attempt: number;
    readonly messageId: string;
    readonly report: DeliveryReport;
    readonly startedAt: string;
  }) => Promise<void>;
  readonly resolveBrandName: (tenantId: string) => Promise<string>;
}

export interface BatchSummary {
  readonly accepted: number;
  readonly failed: number;
  readonly retried: number;
}

/**
 * Drains one claimed batch. Everything durable is a port call, so this is the
 * same code in an Edge function and in a test, and a provider is only ever
 * reached after the business transaction has already committed.
 */
export async function runNotificationBatch(
  ports: NotificationPorts,
): Promise<BatchSummary> {
  const claimed = await ports.claim();
  let accepted = 0;
  let failed = 0;
  let retried = 0;

  for (const message of claimed) {
    const startedAt = new Date().toISOString();
    let report: DeliveryReport;
    try {
      const rendered = renderNotificationEmail(message.templateKey, {
        brandName: await ports.resolveBrandName(message.tenantId),
        locale: message.locale,
        variables: message.payload,
      });
      report = await ports.deliver({
        html: rendered.html,
        // Durable identity first: tenant, booking revision, template, and
        // recipient already made this message unique, and the provider key is
        // only a second, short-window defence.
        idempotencyKey: `${message.tenantId}:${message.messageId}:${message.attempt}`,
        subject: rendered.subject,
        text: rendered.text,
        to: message.recipient,
      });
    } catch (error) {
      // A template that cannot render will never render, so it is permanent.
      report = {
        errorCode: error instanceof Error ? "render_failed" : "unknown_error",
        outcome: "permanent_error",
      };
    }

    await ports.record({
      attempt: message.attempt,
      messageId: message.messageId,
      report,
      startedAt,
    });
    if (report.outcome === "accepted") accepted += 1;
    else if (report.outcome === "retryable_error") retried += 1;
    else failed += 1;
  }

  return { accepted, failed, retried };
}

export interface ResendAdapterOptions {
  readonly apiKey: string;
  readonly from: string;
  /** Injected so a test never reaches the network. */
  readonly fetchImplementation?: typeof fetch;
  readonly replyTo?: string;
}

/**
 * The provider adapter. It classifies a failure rather than throwing, because
 * the difference between "try again" and "never" is what the retry schedule is
 * made of.
 */
export function createResendAdapter(
  options: ResendAdapterOptions,
): NotificationPorts["deliver"] {
  const call = options.fetchImplementation ?? fetch;
  return async (input) => {
    try {
      const response = await call("https://api.resend.com/emails", {
        body: JSON.stringify({
          from: options.from,
          html: input.html,
          ...(options.replyTo === undefined ? {} : { reply_to: options.replyTo }),
          subject: input.subject,
          text: input.text,
          to: [input.to],
        }),
        headers: {
          Authorization: `Bearer ${options.apiKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": input.idempotencyKey,
        },
        method: "POST",
      });
      if (response.ok) {
        const body = (await response.json()) as { id?: unknown };
        return {
          outcome: "accepted",
          ...(typeof body.id === "string" ? { providerReference: body.id } : {}),
        };
      }
      // 4xx is the provider refusing this message; 429 and 5xx are the provider
      // being busy or broken, which is worth trying again.
      const retryable = response.status === 429 || response.status >= 500;
      return {
        errorCode: `http_${response.status}`,
        outcome: retryable ? "retryable_error" : "permanent_error",
      };
    } catch {
      return { errorCode: "network_error", outcome: "retryable_error" };
    }
  };
}
