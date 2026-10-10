import { brandNameFor, type NotificationBrand } from "./brand.js";
import { normalizeNotificationPayload } from "./payload.js";
import { notificationPreviewSample } from "./samples.js";
import { renderNotificationEmail, type NotificationTemplateKey } from "./templates.js";

export interface ClaimedNotification {
  readonly attempt: number;
  readonly bookingRevision: number;
  readonly correlationId: string;
  /** A Dashboard "send a test to me" message: rendered with a test marker. */
  readonly isTest?: boolean;
  readonly locale: "ar" | "en";
  readonly messageId: string;
  /** The outbox payload as written: raw `snake_case` facts or ready strings. */
  readonly payload: Readonly<Record<string, unknown>>;
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
    readonly correlationId: string;
    readonly from?: string;
    readonly html: string;
    readonly idempotencyKey: string;
    readonly isTest?: boolean;
    readonly replyTo?: string;
    readonly subject: string;
    readonly text: string;
    readonly to: string;
  }) => Promise<DeliveryReport>;
  readonly prepare?: (
    message: ClaimedNotification,
    render: (
      variables?: Readonly<Record<string, string>>,
    ) => Promise<NotificationDelivery>,
  ) => Promise<NotificationDelivery>;
  /** Records the attempt durably. Only this decides whether sending is over. */
  readonly record: (input: {
    readonly attempt: number;
    readonly messageId: string;
    readonly report: DeliveryReport;
    readonly startedAt: string;
  }) => Promise<void>;
  /**
   * The tenant's published brand (`get_notification_brand_v2`), or null when
   * it cannot be read right now.
   */
  readonly resolveBrand: (tenantId: string) => Promise<NotificationBrand | null>;
}

export interface BatchSummary {
  readonly accepted: number;
  readonly failed: number;
  readonly retried: number;
}

export type NotificationDelivery = Parameters<NotificationPorts["deliver"]>[0];

export class NotificationPreparationError extends Error {}

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

  // One brand lookup per tenant per batch, not one per message.
  const brands = new Map<string, Promise<NotificationBrand | null>>();
  const brandOf = (tenantId: string) => {
    let pending = brands.get(tenantId);
    if (pending === undefined) {
      pending = ports.resolveBrand(tenantId).catch(() => null);
      brands.set(tenantId, pending);
    }
    return pending;
  };

  for (const message of claimed) {
    const startedAt = new Date().toISOString();
    let report: DeliveryReport;
    try {
      const render = async (
        variables: Readonly<Record<string, string>> = {},
      ): Promise<NotificationDelivery> => {
        const brand = await brandOf(message.tenantId);
        const brandName = brand === null ? null : brandNameFor(brand, message.locale);
        if (brand === null || brandName === null) {
          throw new NotificationPreparationError("brand_unresolved");
        }
        const input = normalizeNotificationPayload(message.payload, message.locale);
        // A test send has no booking behind it, so it wears the same fixed,
        // clearly synthetic sample the Dashboard preview shows; anything the
        // payload does carry still wins.
        const sample =
          message.isTest === true
            ? notificationPreviewSample(message.templateKey, message.locale)
            : null;
        const digest = input.digest ?? sample?.digest;
        const rendered = renderNotificationEmail(message.templateKey, {
          brand,
          brandName,
          ...(digest === undefined ? {} : { digest }),
          ...(message.isTest === true ? { isTest: true } : {}),
          locale: message.locale,
          variables: { ...sample?.variables, ...input.variables, ...variables },
        });
        return {
          html: rendered.html,
          correlationId: message.correlationId,
          // A visibility-timeout reclaim increments `attempt`; that must not
          // make a network-successful send look new to the provider. The
          // durable message id is the stable idempotency identity.
          idempotencyKey: `${message.tenantId}:${message.messageId}`,
          ...(message.isTest === true ? { isTest: true } : {}),
          subject: rendered.subject,
          text: rendered.text,
          to: message.recipient,
        };
      };
      const delivery =
        ports.prepare === undefined
          ? await render()
          : await ports.prepare(message, render);
      report = await ports.deliver(delivery);
    } catch (error) {
      report =
        error instanceof NotificationPreparationError
          ? { errorCode: error.message, outcome: "retryable_error" }
          : { errorCode: "render_failed", outcome: "permanent_error" };
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
          from: input.from ?? options.from,
          html: input.html,
          ...((input.replyTo ?? options.replyTo ?? "") === ""
            ? {}
            : { reply_to: input.replyTo ?? options.replyTo }),
          subject: input.subject,
          tags: [
            { name: "correlation_id", value: input.correlationId },
            ...(input.isTest === true ? [{ name: "is_test", value: "true" }] : []),
          ],
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
