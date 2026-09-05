import { describe, expect, it } from "vitest";
import type { CheckoutCommand, PaymentProvider, PaymentResult } from "./index.js";

const checkout: CheckoutCommand = {
  tenantId: "tenant-a",
  bookingId: "booking-a",
  connectedMerchantReference: "merchant-a",
  total: { currency: "USD", minorUnits: 1250 },
  returnUrl: "https://client.example.invalid/return",
  cancelUrl: "https://client.example.invalid/cancel",
  idempotencyKey: "checkout-a",
};

function adapter(name: "stripe" | "regional"): PaymentProvider {
  const result: PaymentResult = {
    providerPaymentReference: `${name}-payment-a`,
    status: "succeeded",
    amount: checkout.total,
  };
  return {
    name,
    async startOnboarding() {
      return {
        status: "requirements_due",
        onboardingUrl: "https://provider.example.invalid/onboard",
        providerAccountReference: `${name}-account-a`,
        expiresAt: "2026-09-06T00:00:00Z",
      };
    },
    async getAccountStatus() {
      return {
        status: "connected",
        chargesEnabled: true,
        payoutsEnabled: true,
        requirements: [],
        capabilities: { card_payments: "active" },
      };
    },
    async createCheckout() {
      return {
        checkoutUrl: "https://provider.example.invalid/checkout",
        expiresAt: "2026-09-06T00:00:00Z",
        providerCheckoutReference: `${name}-checkout-a`,
        status: "processing",
      };
    },
    async retrievePayment() {
      return result;
    },
    async captureAuthorization() {
      return result;
    },
    async cancelAuthorization() {
      return { ...result, status: "cancelled" };
    },
    async refund() {
      return {
        providerRefundReference: `${name}-refund-a`,
        status: "pending",
        amount: checkout.total,
      };
    },
    async retrieveDispute() {
      return { providerDisputeReference: `${name}-dispute-a`, status: "under_review" };
    },
    async retrievePayout() {
      return {
        providerPayoutReference: `${name}-payout-a`,
        status: "paid",
        amount: checkout.total,
      };
    },
    async verifyAndNormalizeWebhook() {
      return {
        providerEventReference: `${name}-event-a`,
        type: "payment.captured",
        occurredAt: "2026-09-05T00:00:00Z",
        objectKind: "payment",
        objectReference: result.providerPaymentReference,
        accountReference: "merchant-a",
        paymentReference: result.providerPaymentReference,
        amount: result.amount,
        status: result.status,
      };
    },
  };
}

describe("provider-neutral payment contract", () => {
  it.each(["stripe", "regional"] as const)(
    "supports %s without domain-specific types",
    async (name) => {
      const provider = adapter(name);
      const payment = await provider.retrievePayment({
        tenantId: checkout.tenantId,
        providerPaymentReference: "payment-a",
      });
      expect(payment.amount).toEqual({ currency: "USD", minorUnits: 1250 });
      expect(
        (
          await provider.verifyAndNormalizeWebhook({
            rawBody: "{}",
            signature: "verified",
            secretReference: "secret-ref",
          })
        ).type,
      ).toBe("payment.captured");
    },
  );
});
