import { z } from "zod";
import {
  lineList,
  optionalInstant,
  optionalText,
  reason,
  requiredText,
} from "./fields";

export const flagKinds = [
  "feature",
  "incident_banner",
  "maintenance_window",
  "kill_switch",
] as const;

export const integrationProviders = [
  "github",
  "vercel",
  "resend",
  "stripe",
  "supabase",
] as const;

const message = optionalText(500).transform((value) => value ?? null);

export const saveFlagSchema = z.object({
  key: requiredText(61).transform((value) => value.toLowerCase()),
  kind: z.enum(flagKinds, { error: "required" }),
  enabled: z.boolean(),
  messageEn: message,
  messageAr: message,
  startsAt: optionalInstant,
  endsAt: optionalInstant,
  reason: reason(5),
});
export type SaveFlagInput = z.input<typeof saveFlagSchema>;

/** Only a well-formed flag or feature key is recorded as the audit target. */
export const dottedKeyPattern = /^[a-z][a-z0-9_.]{1,60}$/u;

const provider = z.enum(integrationProviders, { error: "not_found" });

export const saveReferencesSchema = z.object({
  provider,
  // Names only, upper-cased; the database refuses anything secret-shaped.
  references: lineList.transform((names) => names.map((name) => name.toUpperCase())),
});
export type SaveReferencesInput = z.input<typeof saveReferencesSchema>;

export const integrationCheckSchema = z.object({ provider });
export type IntegrationCheckInput = z.input<typeof integrationCheckSchema>;
