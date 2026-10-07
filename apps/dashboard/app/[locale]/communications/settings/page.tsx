import type { NotificationSettingsV1 } from "@wlbp/api-contracts";
import type { Locale } from "@wlbp/i18n";
import { Alert, AlertDescription, PageHeader } from "@wlbp/ui-foundation";
import { CommunicationsNav } from "../../../_lib/communications-nav";
import { DashboardAccessPanel } from "../../../_lib/dashboard-access-panel";
import { loadDashboardRequestAccess } from "../../../_lib/dashboard-server";
import { hasDirectCapability } from "../../../_lib/notification-access";
import { notificationText } from "../../../_lib/notification-copy";
import { WorkspaceShell } from "../../../_lib/workspace-shell";
import { NotificationSettingsForm } from "./notification-settings-form";

export const dynamic = "force-dynamic";

export default async function NotificationSettingsPage({
  params,
}: {
  readonly params: Promise<{ locale: Locale }>;
}) {
  const { locale } = await params;
  const t = (key: Parameters<typeof notificationText>[1]) =>
    notificationText(locale, key);
  const request = await loadDashboardRequestAccess(locale);
  const canEdit =
    request.state.kind === "ready" &&
    hasDirectCapability(request.state.context, "policy.edit");

  let body;
  if (request.state.kind !== "ready")
    body = <DashboardAccessPanel locale={locale} state={request.state} />;
  else if (!canEdit)
    body = (
      <Alert tone="warning">
        <AlertDescription className="text-foreground">
          {t("settingsDenied")}
        </AlertDescription>
      </Alert>
    );
  else {
    const tenantId = request.state.context.tenantId;
    let settings: NotificationSettingsV1 | null = null;
    try {
      settings = (await request.source?.getNotificationSettings?.(tenantId)) ?? null;
    } catch {
      /* Distinct failed-read state below. */
    }
    body = settings ? (
      <NotificationSettingsForm
        locale={locale}
        settings={settings}
        attempt={crypto.randomUUID()}
      />
    ) : (
      <Alert tone="danger">
        <AlertDescription className="text-foreground">
          {t("settingsUnavailable")}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <WorkspaceShell
      locale={locale}
      current="communications"
      labelledBy="notification-settings-title"
    >
      <div className="grid gap-8">
        <PageHeader
          titleId="notification-settings-title"
          title={t("settingsTitle")}
          description={t("settingsSummary")}
        />
        <CommunicationsNav locale={locale} current="settings" showSettings={canEdit} />
        {body}
      </div>
    </WorkspaceShell>
  );
}
