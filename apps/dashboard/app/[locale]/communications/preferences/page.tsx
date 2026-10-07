import type {
  MyNotificationPreferencesV1,
  StaffNotificationPreferencesV1,
} from "@wlbp/api-contracts";
import { staffPreferenceKeysV1 } from "@wlbp/api-contracts";
import type { Locale } from "@wlbp/i18n";
import {
  Alert,
  AlertDescription,
  EmptyState,
  PageHeader,
  Section,
  StatusStamp,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@wlbp/ui-foundation";
import { UsersRound } from "lucide-react";
import { CommunicationsNav } from "../../../_lib/communications-nav";
import { DashboardAccessPanel } from "../../../_lib/dashboard-access-panel";
import { loadDashboardRequestAccess } from "../../../_lib/dashboard-server";
import { hasDirectCapability } from "../../../_lib/notification-access";
import { notificationText, templateLabel } from "../../../_lib/notification-copy";
import { WorkspaceShell } from "../../../_lib/workspace-shell";
import { MyPreferencesForm } from "./preferences-form";

export const dynamic = "force-dynamic";

/** `HH:MM` as the locale reads a time of day (the zone is each member's own). */
function formatClock(value: string, locale: Locale): string {
  const [hours = 0, minutes = 0] = value.split(":").map(Number);
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-u-nu-arab" : "en", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(2000, 0, 1, hours, minutes)));
}

function TeamPreferences({
  locale,
  team,
}: {
  readonly locale: Locale;
  readonly team: StaffNotificationPreferencesV1 | null;
}) {
  const t = (key: Parameters<typeof notificationText>[1]) =>
    notificationText(locale, key);
  if (team === null)
    return (
      <Alert tone="danger">
        <AlertDescription className="text-foreground">
          {t("teamUnavailable")}
        </AlertDescription>
      </Alert>
    );
  if (team.members.length === 0)
    return <EmptyState icon={<UsersRound />} title={t("teamEmpty")} />;
  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <Table label={t("teamTitle")}>
        <TableHeader>
          <TableRow>
            <TableHead scope="col">{t("teamMember")}</TableHead>
            {staffPreferenceKeysV1.map((key) => (
              <TableHead scope="col" key={key}>
                {templateLabel(locale, key)}
              </TableHead>
            ))}
            <TableHead scope="col">{t("teamDigestTime")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {team.members.map((member) => {
            const enabled = new Map(
              member.items.map((item) => [item.templateKey, item.enabled]),
            );
            return (
              <TableRow key={member.membershipId}>
                <TableHead
                  scope="row"
                  className="h-auto py-3 text-sm font-medium whitespace-normal text-foreground"
                >
                  <bdi>{member.name}</bdi>
                </TableHead>
                {staffPreferenceKeysV1.map((key) => (
                  <TableCell key={key}>
                    <StatusStamp state={enabled.get(key) ? "confirmed" : "neutral"}>
                      {t(enabled.get(key) ? "teamOn" : "teamOff")}
                    </StatusStamp>
                  </TableCell>
                ))}
                <TableCell>
                  <time dateTime={member.digestLocalTime}>
                    {formatClock(member.digestLocalTime, locale)}
                  </time>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

export default async function MyEmailPreferencesPage({
  params,
}: {
  readonly params: Promise<{ locale: Locale }>;
}) {
  const { locale } = await params;
  const t = (key: Parameters<typeof notificationText>[1]) =>
    notificationText(locale, key);
  const request = await loadDashboardRequestAccess(locale);
  const ready = request.state.kind === "ready" ? request.state.context : null;
  const canEditSettings = ready !== null && hasDirectCapability(ready, "policy.edit");
  const canSeeTeam = ready !== null && hasDirectCapability(ready, "staff.manage");

  let body;
  if (request.state.kind !== "ready" || ready === null)
    body = <DashboardAccessPanel locale={locale} state={request.state} />;
  else {
    const [mine, team] = await Promise.all([
      (async (): Promise<MyNotificationPreferencesV1 | null> => {
        try {
          return (
            (await request.source?.getMyNotificationPreferences?.(ready.tenantId)) ??
            null
          );
        } catch {
          return null;
        }
      })(),
      (async (): Promise<StaffNotificationPreferencesV1 | null> => {
        if (!canSeeTeam) return null;
        try {
          return (
            (await request.source?.listStaffNotificationPreferences?.(
              ready.tenantId,
            )) ?? null
          );
        } catch {
          return null;
        }
      })(),
    ]);
    body = (
      <>
        {mine ? (
          <MyPreferencesForm
            locale={locale}
            preferences={mine}
            attempt={crypto.randomUUID()}
          />
        ) : (
          <Alert tone="danger">
            <AlertDescription className="text-foreground">
              {t("prefsUnavailable")}
            </AlertDescription>
          </Alert>
        )}
        {canSeeTeam ? (
          <Section
            id="team-notification-preferences"
            title={t("teamTitle")}
            description={t("teamSummary")}
          >
            <TeamPreferences locale={locale} team={team} />
          </Section>
        ) : null}
      </>
    );
  }

  return (
    <WorkspaceShell
      locale={locale}
      current="communications"
      labelledBy="email-preferences-title"
    >
      <div className="grid gap-8">
        <PageHeader
          titleId="email-preferences-title"
          title={t("prefsTitle")}
          description={t("prefsSummary")}
        />
        <CommunicationsNav
          locale={locale}
          current="preferences"
          showSettings={canEditSettings}
        />
        {body}
      </div>
    </WorkspaceShell>
  );
}
