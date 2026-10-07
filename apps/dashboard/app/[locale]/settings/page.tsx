import type { Locale } from "@wlbp/i18n";
import {
  Alert,
  AlertDescription,
  EmptyState,
  Facts,
  PageHeader,
  Section,
  StatusStamp,
} from "@wlbp/ui-foundation";

import { getDashboardMessage } from "../../_lib/copy";
import type { TenantConfigurationV1 } from "../../_lib/dashboard-access";
import { loadDashboardRequestAccess } from "../../_lib/dashboard-server";
import { WorkspaceShell } from "../../_lib/workspace-shell";
import { SettingsForm } from "./settings-form";
import { positiveSettingsResults, settingsResultKeys } from "./results";
import { featureLabel } from "./feature-label";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

type SettingsPageProps = {
  readonly params: Promise<{ locale: Locale }>;
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function SettingsPage({
  params,
  searchParams,
}: SettingsPageProps) {
  const { locale } = await params;
  const query = await searchParams;
  const message = (key: Parameters<typeof getDashboardMessage>[1]) =>
    getDashboardMessage(locale, key);

  const request = await loadDashboardRequestAccess(locale);
  const configuration: TenantConfigurationV1 | null =
    request.source !== null && request.state.kind === "ready"
      ? ((await request.source
          .getTenantConfiguration?.({ tenantId: request.state.context.tenantId })
          .catch(() => null)) ?? null)
      : null;

  const result = typeof query.result === "string" ? query.result : null;
  const resultKey =
    result !== null && result in settingsResultKeys
      ? settingsResultKeys[result as keyof typeof settingsResultKeys]
      : null;

  const entitlementKeys =
    configuration === null ? [] : Object.keys(configuration.entitlements).sort();

  return (
    <WorkspaceShell current="settings" labelledBy="settings-title" locale={locale}>
      <div className="grid gap-10">
        <PageHeader
          titleId="settings-title"
          title={message("settingsTitle")}
          description={message("settingsSummary")}
        />
        {resultKey === null ? null : (
          <Alert
            tone={positiveSettingsResults.has(result ?? "") ? "positive" : "warning"}
          >
            <AlertDescription className="text-foreground">
              {message(resultKey)}
            </AlertDescription>
          </Alert>
        )}

        {configuration === null ? (
          <Alert tone="danger">
            <AlertDescription className="text-foreground">
              {message("settingsUnavailable")}
            </AlertDescription>
          </Alert>
        ) : (
          <>
            {/* Read-only on purpose. What the plan grants is not something
                anybody inside the tenant can edit, and the interface should
                not imply otherwise by offering a control. */}
            <Section
              id="settings-plan"
              title={message("settingsPlanTitle")}
              description={message("settingsPlanHint")}
            >
              {entitlementKeys.length === 0 ? (
                <EmptyState title={message("settingsPlanEmpty")} />
              ) : (
                <ul
                  aria-label={message("settingsPlanTitle")}
                  className="grid divide-y rounded-lg border bg-card"
                >
                  {entitlementKeys.map((key) => (
                    <li
                      key={key}
                      className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm"
                    >
                      <bdi className="font-medium">{featureLabel(locale, key)}</bdi>
                      <StatusStamp
                        state={
                          configuration.entitlements[key] === true
                            ? "confirmed"
                            : "neutral"
                        }
                      >
                        {message(
                          configuration.entitlements[key] === true
                            ? "settingsFeatureGranted"
                            : "settingsFeatureUnavailable",
                        )}
                      </StatusStamp>
                    </li>
                  ))}
                </ul>
              )}
            </Section>

            <Section
              id="settings-edit"
              title={message("settingsEditTitle")}
              description={message("settingsEditHint")}
            >
              <SettingsForm locale={locale} configuration={configuration} />
            </Section>

            <Section id="settings-versions" title={message("settingsVersionsTitle")}>
              <div className="rounded-lg border bg-card p-5">
                <Facts
                  columns={3}
                  items={[
                    {
                      key: "config",
                      label: message("settingsConfigVersion"),
                      value: <bdi dir="ltr">{configuration.configVersion}</bdi>,
                    },
                    {
                      key: "feature",
                      label: message("settingsFeatureVersion"),
                      value: <bdi dir="ltr">{configuration.featureVersion}</bdi>,
                    },
                    {
                      key: "locale",
                      label: message("settingsDefaultLocale"),
                      value: <bdi dir="ltr">{configuration.defaultLocale}</bdi>,
                    },
                  ]}
                />
              </div>
            </Section>
          </>
        )}
      </div>
    </WorkspaceShell>
  );
}
