"use server";
import { revalidatePath } from "next/cache";
import {
  actionError,
  actionOk,
  parseActionInput,
  type ActionResult,
} from "@wlbp/ui-foundation/actions";
import { createDashboardAuthClient } from "../../../_lib/auth-server";
import { loadDashboardRequestAccess } from "../../../_lib/dashboard-server";
import {
  hasDirectCapability,
  stableRpcMessage,
} from "../../../_lib/notification-access";
import type { NotificationMessageKey } from "../../../_lib/notification-copy";
import {
  emailPreviewSchema,
  notificationSettingsSchema,
  testNotificationSchema,
  type EmailPreviewInput,
  type NotificationSettingsInput,
  type TestNotificationInput,
} from "./notification-settings-schema";

type Code = NotificationMessageKey | "denied" | "unavailable";

async function readySettingsRequest(locale: "ar" | "en") {
  const request = await loadDashboardRequestAccess(locale);
  if (
    request.state.kind !== "ready" ||
    request.source === null ||
    !hasDirectCapability(request.state.context, "policy.edit")
  )
    return null;
  return { source: request.source, tenantId: request.state.context.tenantId };
}

/**
 * Saves which messages the tenant sends and the reminder lead times. The
 * stored settings are read first so only what this operator may change is
 * sent: email for editable types, WhatsApp only for capable types while the
 * channel is available. The database re-validates, checks the revision and
 * replays a repeated request id.
 */
export async function saveNotificationSettingsAction(
  input: NotificationSettingsInput,
): Promise<ActionResult<{ readonly revision: number }>> {
  const parsed = parseActionInput(notificationSettingsSchema, input);
  if (!parsed.ok) return parsed.result;
  const { locale, expectedRevision, requestId, items, reminderOffsets } = parsed.data;
  const ready = await readySettingsRequest(locale);
  if (
    ready === null ||
    !ready.source.getNotificationSettings ||
    !ready.source.saveNotificationSettings
  )
    return actionError("denied" satisfies Code);
  try {
    const current = await ready.source.getNotificationSettings(ready.tenantId);
    const catalog = new Map(current.items.map((item) => [item.templateKey, item]));
    const settings = items.flatMap((item) => {
      const known = catalog.get(item.templateKey);
      if (!known) return [];
      const change = {
        templateKey: item.templateKey,
        ...(known.editable ? { emailEnabled: item.emailEnabled } : {}),
        ...(known.whatsappCapable && current.whatsappAvailable
          ? { whatsappEnabled: item.whatsappEnabled }
          : {}),
      };
      return Object.keys(change).length > 1 ? [change] : [];
    });
    const saved = await ready.source.saveNotificationSettings({
      tenantId: ready.tenantId,
      settings,
      reminderOffsetsMinutes: reminderOffsets,
      expectedRevision,
      requestId,
    });
    revalidatePath(`/${locale}/communications/settings`);
    return actionOk({ revision: saved.revision });
  } catch (error) {
    const stable = stableRpcMessage(error);
    const code: Code =
      stable === "revision_conflict"
        ? "settingsConflict"
        : stable === "policy_denied"
          ? "denied"
          : stable === "notification_settings_invalid"
            ? "settingsInvalid"
            : "unavailable";
    return actionError(code);
  }
}

export interface EmailPreview {
  readonly subject: string;
  readonly html: string;
  readonly text: string;
}

const maxPreviewCharacters = 512 * 1024;

/** The edge function's refusal code, read from its JSON body when present. */
async function previewErrorCode(error: unknown): Promise<string> {
  const context = (error as { context?: unknown } | null)?.context;
  if (!(context instanceof Response)) return "";
  try {
    const body = (await context.json()) as { error?: unknown };
    return typeof body.error === "string" ? body.error : "";
  } catch {
    return "";
  }
}

/**
 * Renders one email with sample data in the tenant's published brand, by the
 * platform `email-preview` Edge Function under the operator's own session
 * (never a service key). The function authorizes the caller itself.
 */
export async function previewNotificationEmailAction(
  input: EmailPreviewInput,
): Promise<ActionResult<EmailPreview>> {
  const parsed = parseActionInput(emailPreviewSchema, input);
  if (!parsed.ok) return parsed.result;
  const { locale, templateKey, emailLocale } = parsed.data;
  const ready = await readySettingsRequest(locale);
  const client = await createDashboardAuthClient();
  if (ready === null || client === null)
    return actionError("previewDenied" satisfies Code);
  try {
    const { data, error } = await client.functions.invoke("email-preview", {
      body: { tenantId: ready.tenantId, templateKey, locale: emailLocale },
    });
    if (error) {
      const code = await previewErrorCode(error);
      return actionError(
        (code === "brand_unavailable"
          ? "previewBrandUnavailable"
          : code === "not_authorized"
            ? "previewDenied"
            : "previewFailed") satisfies Code,
      );
    }
    const body = data as Partial<Record<keyof EmailPreview, unknown>> | null;
    if (
      typeof body?.subject !== "string" ||
      typeof body.html !== "string" ||
      typeof body.text !== "string" ||
      body.subject.length > 1000 ||
      body.html.length > maxPreviewCharacters ||
      body.text.length > maxPreviewCharacters
    )
      return actionError("previewFailed" satisfies Code);
    // The email links brand images on the Client origin, which the Dashboard's
    // CSP (img-src 'self') blocks inside the preview frame. Both apps ship the
    // same validated brand assets under /assets/, so point images at the
    // Dashboard's own copy; the sent email is unchanged.
    const html = body.html.replace(
      /(<img\b[^>]*\bsrc=")https:\/\/[^"/]+(\/assets\/)/giu,
      "$1$2",
    );
    return actionOk({ subject: body.subject, html, text: body.text });
  } catch {
    return actionError("previewFailed" satisfies Code);
  }
}

/**
 * Queues one test of a message to the operator's OWN verified address. The
 * database chooses the recipient (there is no recipient input), rate-limits
 * per member, and replays a repeated request id.
 */
export async function sendTestNotificationAction(
  input: TestNotificationInput,
): Promise<ActionResult<{ readonly messageId: string; readonly replayed: boolean }>> {
  const parsed = parseActionInput(testNotificationSchema, input);
  if (!parsed.ok) return parsed.result;
  const { locale, templateKey, emailLocale, requestId } = parsed.data;
  const ready = await readySettingsRequest(locale);
  if (ready === null || !ready.source.enqueueTestNotification)
    return actionError("previewDenied" satisfies Code);
  try {
    const queued = await ready.source.enqueueTestNotification({
      tenantId: ready.tenantId,
      templateKey,
      locale: emailLocale,
      requestId,
    });
    revalidatePath(`/${locale}/communications`);
    return actionOk({ messageId: queued.messageId, replayed: queued.replayed });
  } catch (error) {
    const stable = stableRpcMessage(error);
    return actionError(
      (stable === "notification_test_rate_limited"
        ? "testRateLimited"
        : stable === "notification_test_recipient_unverified"
          ? "testUnverified"
          : stable === "policy_denied"
            ? "previewDenied"
            : "testFailed") satisfies Code,
    );
  }
}
