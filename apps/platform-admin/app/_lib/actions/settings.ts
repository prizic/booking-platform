"use server";

import { parseActionInput } from "@wlbp/ui-foundation/actions";
import { runOperatorAction, type OperatorActionResult } from "../operator-action";
import {
  dottedKeyPattern,
  integrationCheckSchema,
  saveFlagSchema,
  saveReferencesSchema,
  type IntegrationCheckInput,
  type SaveFlagInput,
  type SaveReferencesInput,
} from "../schemas/settings";

export async function saveFlagAction(
  input: SaveFlagInput,
): Promise<OperatorActionResult> {
  const parsed = parseActionInput(saveFlagSchema, input);
  if (!parsed.ok) return parsed.result;
  const flag = parsed.data;
  return (
    await runOperatorAction({
      action: "platform_flag.save",
      fn: "save_platform_flag_v1",
      args: {
        p_key: flag.key,
        p_kind: flag.kind,
        p_enabled: flag.enabled,
        p_message_en: flag.messageEn,
        p_message_ar: flag.messageAr,
        p_starts_at: flag.startsAt,
        p_ends_at: flag.endsAt,
        p_reason: flag.reason,
      },
      targetKind: "platform_flag",
      targetId: dottedKeyPattern.test(flag.key) ? flag.key : undefined,
    })
  ).result;
}

export async function saveReferencesAction(
  input: SaveReferencesInput,
): Promise<OperatorActionResult> {
  const parsed = parseActionInput(saveReferencesSchema, input);
  if (!parsed.ok) return parsed.result;
  const { provider, references } = parsed.data;
  return (
    await runOperatorAction({
      action: "integration.save_references",
      fn: "save_integration_references_v1",
      args: { p_provider: provider, p_secret_references: references },
      targetKind: "integration",
      targetId: provider,
    })
  ).result;
}

export async function requestIntegrationCheckAction(
  input: IntegrationCheckInput,
): Promise<OperatorActionResult> {
  const parsed = parseActionInput(integrationCheckSchema, input);
  if (!parsed.ok) return parsed.result;
  const { provider } = parsed.data;
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
