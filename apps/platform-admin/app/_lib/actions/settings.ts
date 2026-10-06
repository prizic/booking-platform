"use server";

import { instant, lines, optional, text } from "../form-data";
import { runOperatorAction, type ActionResult } from "../operator-action";

const providers = new Set(["github", "vercel", "resend", "stripe", "supabase"]);

export async function saveFlagAction(
  _previous: ActionResult,
  form: FormData,
): Promise<ActionResult> {
  const key = text(form, "key").toLowerCase();
  return (
    await runOperatorAction({
      action: "platform_flag.save",
      fn: "save_platform_flag_v1",
      args: {
        p_key: key,
        p_kind: text(form, "kind"),
        p_enabled: form.get("enabled") === "on",
        p_message_en: optional(form, "messageEn") ?? null,
        p_message_ar: optional(form, "messageAr") ?? null,
        p_starts_at: instant(form, "startsAt") ?? null,
        p_ends_at: instant(form, "endsAt") ?? null,
        p_reason: text(form, "reason"),
      },
      targetKind: "platform_flag",
      targetId: /^[a-z][a-z0-9_.]{1,60}$/u.test(key) ? key : undefined,
    })
  ).result;
}

export async function saveReferencesAction(
  _previous: ActionResult,
  form: FormData,
): Promise<ActionResult> {
  const provider = text(form, "provider");
  if (!providers.has(provider)) return { kind: "error", code: "not_found" };
  return (
    await runOperatorAction({
      action: "integration.save_references",
      fn: "save_integration_references_v1",
      // Names only, upper-cased; the database refuses anything secret-shaped.
      args: {
        p_provider: provider,
        p_secret_references: lines(form, "references").map((r) => r.toUpperCase()),
      },
      targetKind: "integration",
      targetId: provider,
    })
  ).result;
}

export async function requestIntegrationCheckAction(
  _previous: ActionResult,
  form: FormData,
): Promise<ActionResult> {
  const provider = text(form, "provider");
  if (!providers.has(provider)) return { kind: "error", code: "not_found" };
  return (
    await runOperatorAction({
      action: "integration.request_check",
      fn: "request_integration_check_v1",
      args: { p_provider: provider },
      targetKind: "integration",
      targetId: provider,
    })
  ).result;
}
