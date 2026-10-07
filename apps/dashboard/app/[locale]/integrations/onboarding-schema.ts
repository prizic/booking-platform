/* One schema for preparing a hosted payment-onboarding link. */
import { z } from "zod";
import { localeField } from "../services/schema-kit";

export const paymentOnboardingSchema = z.object({
  locale: localeField,
  requestId: z.string().regex(/^[a-f0-9-]{36}$/iu, { error: "invalid" }),
});
export type PaymentOnboardingInput = z.input<typeof paymentOnboardingSchema>;
