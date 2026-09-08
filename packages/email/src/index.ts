export * from "./templates.js";
export * from "./worker.js";
export * from "./webhook.js";

import type { NotificationStatusDto } from "@wlbp/api-contracts";

export interface EmailAddress {
  readonly address: string;
  readonly displayName?: string;
}

export interface EmailTemplateReference {
  readonly key: string;
  readonly locale: "en" | "ar";
  readonly version: number;
}

export interface EmailDeliveryCommand {
  readonly idempotencyKey: string;
  readonly messageId: string;
  readonly replyTo?: EmailAddress;
  readonly template: EmailTemplateReference;
  readonly templateData: Readonly<Record<string, unknown>>;
  readonly tenantId: string;
  readonly to: readonly EmailAddress[];
}

export interface EmailDeliveryResult {
  readonly acceptedAt?: string;
  readonly providerMessageReference?: string;
  readonly status: NotificationStatusDto;
}

/**
 * Provider-neutral seam for platform workers. Concrete provider adapters stay
 * private and execute only after an outbox event has committed.
 */
export interface EmailDeliveryPort {
  readonly deliver: (command: EmailDeliveryCommand) => Promise<EmailDeliveryResult>;
}
