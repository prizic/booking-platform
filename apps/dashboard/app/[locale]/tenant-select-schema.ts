import { z } from "zod";

import { localeField } from "../_lib/form-schema";

/**
 * Opening another workspace names only the tenant. Membership is re-read on
 * the server; the id here is a choice, never an authorization.
 */
export const tenantSelectSchema = z.object({
  locale: localeField,
  tenantId: z.string().trim().min(1, { error: "required" }),
});
export type TenantSelectInput = z.input<typeof tenantSelectSchema>;
