import type {
  CalendarExportStatusDto,
  MoneyDto,
  PaymentStatusDto,
  RefundStatusDto,
} from "@wlbp/api-contracts";

export type PaymentProviderName = "stripe" | (string & {});
export type MerchantAccountStatus =
  | "connected"
  | "requirements_due"
  | "restricted"
  | "suspended"
  | "disconnected"
  | "error";
export type ProviderObjectKind =
  "account" | "checkout" | "payment" | "charge" | "refund" | "dispute" | "payout";
export type CanonicalPaymentEventType =
  | "payment.authorized"
  | "payment.captured"
  | "payment.failed"
  | "payment.cancelled"
  | "refund.updated"
  | "dispute.updated"
  | "payout.updated";

export interface PaymentProvider {
  readonly name: PaymentProviderName;
  startOnboarding(command: OnboardingCommand): Promise<OnboardingResult>;
  getAccountStatus(command: AccountStatusCommand): Promise<AccountStatusResult>;
  createCheckout(command: CheckoutCommand): Promise<CheckoutResult>;
  retrievePayment(command: RetrievePaymentCommand): Promise<PaymentResult>;
  captureAuthorization(command: PaymentActionCommand): Promise<PaymentResult>;
  cancelAuthorization(command: PaymentActionCommand): Promise<PaymentResult>;
  refund(command: RefundCommand): Promise<RefundResult>;
  retrieveDispute(command: ProviderObjectCommand): Promise<DisputeResult>;
  retrievePayout(command: ProviderObjectCommand): Promise<PayoutResult>;
  verifyAndNormalizeWebhook(
    command: VerifyWebhookCommand,
  ): Promise<NormalizedPaymentEvent>;
}

export interface OnboardingCommand {
  readonly tenantId: string;
  readonly returnUrl: string;
  readonly refreshUrl: string;
  readonly idempotencyKey: string;
}
export interface OnboardingResult {
  readonly status: MerchantAccountStatus;
  readonly onboardingUrl: string;
  readonly providerAccountReference: string;
  readonly expiresAt: string;
}
export interface AccountStatusCommand {
  readonly tenantId: string;
  readonly providerAccountReference: string;
}
export interface AccountStatusResult {
  readonly status: MerchantAccountStatus;
  readonly chargesEnabled: boolean;
  readonly payoutsEnabled: boolean;
  readonly requirements: readonly string[];
  readonly capabilities: Readonly<Record<string, "active" | "pending" | "inactive">>;
}
export interface CheckoutCommand {
  readonly tenantId: string;
  readonly bookingId: string;
  readonly connectedMerchantReference: string;
  readonly total: MoneyDto;
  readonly returnUrl: string;
  readonly cancelUrl: string;
  readonly idempotencyKey: string;
}
export interface RetrievePaymentCommand {
  readonly tenantId: string;
  readonly providerPaymentReference: string;
}
export interface PaymentActionCommand extends RetrievePaymentCommand {
  readonly idempotencyKey: string;
}
export interface RefundCommand extends PaymentActionCommand {
  readonly amount?: MoneyDto;
  readonly reason: "requested_by_customer" | "duplicate" | "fraudulent";
}
export interface ProviderObjectCommand {
  readonly tenantId: string;
  readonly providerObjectReference: string;
}
export interface VerifyWebhookCommand {
  readonly rawBody: string;
  readonly signature: string;
  readonly secretReference: string;
  readonly tenantId?: string;
}
export interface PaymentResult {
  readonly providerPaymentReference: string;
  readonly status: PaymentStatusDto;
  readonly amount: MoneyDto;
}
export interface RefundResult {
  readonly providerRefundReference: string;
  readonly status: RefundStatusDto;
  readonly amount: MoneyDto;
}
export interface DisputeResult {
  readonly providerDisputeReference: string;
  readonly status: "warning_needs_response" | "under_review" | "won" | "lost";
  readonly dueAt?: string;
}
export interface PayoutResult {
  readonly providerPayoutReference: string;
  readonly status: "pending" | "in_transit" | "paid" | "failed" | "canceled";
  readonly amount: MoneyDto;
}
export interface NormalizedPaymentEvent {
  readonly providerEventReference: string;
  readonly type: CanonicalPaymentEventType;
  readonly occurredAt: string;
  readonly objectKind: ProviderObjectKind;
  readonly objectReference: string;
  readonly accountReference: string;
  readonly paymentReference?: string;
  readonly amount?: MoneyDto;
  readonly status:
    | PaymentStatusDto
    | RefundStatusDto
    | DisputeResult["status"]
    | PayoutResult["status"];
}

export interface ProviderCommandContext {
  readonly idempotencyKey: string;
  readonly tenantId: string;
}

export interface StartCheckoutCommand extends ProviderCommandContext {
  readonly bookingId: string;
  readonly cancelUrl: string;
  readonly connectedMerchantReference: string;
  readonly returnUrl: string;
  readonly total: MoneyDto;
}

export interface CheckoutResult {
  readonly checkoutUrl: string;
  readonly expiresAt: string;
  readonly providerCheckoutReference: string;
  readonly status: PaymentStatusDto;
}

export interface PaymentPort {
  readonly startHostedCheckout: (
    command: StartCheckoutCommand,
  ) => Promise<CheckoutResult>;
  readonly reconcile: (
    context: ProviderCommandContext & { readonly providerPaymentReference: string },
  ) => Promise<{ readonly status: PaymentStatusDto }>;
}

export interface CalendarExportCommand {
  readonly bookingId: string;
  readonly endAt: string;
  readonly locale: "en" | "ar";
  readonly sequence: number;
  readonly startAt: string;
  readonly summary: string;
  readonly timeZone: string;
}

export interface CalendarExportPort {
  readonly generateIcs: (command: CalendarExportCommand) => Promise<{
    readonly content: string;
    readonly filename: string;
    readonly status: CalendarExportStatusDto;
  }>;
}
