import type {
  CalendarExportStatusDto,
  MoneyDto,
  PaymentStatusDto,
} from "@wlbp/api-contracts";

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
