import type { Locale } from "@wlbp/i18n";
import { Badge, StatusMessage, Surface } from "@wlbp/ui-foundation";

import { getDashboardMessage } from "../../_lib/copy";
import type { TenantConfigurationV1 } from "../../_lib/dashboard-access";
import { loadDashboardRequestAccess } from "../../_lib/dashboard-server";
import { WorkspaceShell } from "../../_lib/workspace-shell";
import { SettingsForm } from "./settings-form";
import { positiveSettingsResults, settingsResultKeys } from "./results";

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
      <Surface as="section" className="requests-queue" labelledBy="settings-title">
        <h1 id="settings-title">{message("settingsTitle")}</h1>
        <p>{message("settingsSummary")}</p>
        {resultKey === null ? null : (
          <StatusMessage
            tone={positiveSettingsResults.has(result ?? "") ? "positive" : "warning"}
          >
            {message(resultKey)}
          </StatusMessage>
        )}

        {configuration === null ? (
          <p>{message("settingsUnavailable")}</p>
        ) : (
          <>
            <section aria-labelledby="settings-plan-title">
              <h2 id="settings-plan-title">{message("settingsPlanTitle")}</h2>
              {/* Read-only on purpose. What the plan grants is not something
                  anybody inside the tenant can edit, and the interface should
                  not imply otherwise by offering a control. */}
              <p>{message("settingsPlanHint")}</p>
              {entitlementKeys.length === 0 ? (
                <p>{message("settingsPlanEmpty")}</p>
              ) : (
                <ul aria-label={message("settingsPlanTitle")}>
                  {entitlementKeys.map((key) => (
                    <li key={key}>
                      <bdi>{featureLabel(locale, key)}</bdi>{" "}
                      <Badge
                        tone={
                          configuration.entitlements[key] === true
                            ? "positive"
                            : "neutral"
                        }
                      >
                        {message(
                          configuration.entitlements[key] === true
                            ? "settingsFeatureGranted"
                            : "settingsFeatureUnavailable",
                        )}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section aria-labelledby="settings-edit-title">
              <h2 id="settings-edit-title">{message("settingsEditTitle")}</h2>
              <p>{message("settingsEditHint")}</p>
              <SettingsForm locale={locale} configuration={configuration} />
            </section>

            <section aria-labelledby="settings-versions-title">
              <h2 id="settings-versions-title">{message("settingsVersionsTitle")}</h2>
              <dl>
                <div>
                  <dt>{message("settingsConfigVersion")}</dt>
                  <dd dir="ltr">{configuration.configVersion}</dd>
                </div>
                <div>
                  <dt>{message("settingsFeatureVersion")}</dt>
                  <dd dir="ltr">{configuration.featureVersion}</dd>
                </div>
                <div>
                  <dt>{message("settingsDefaultLocale")}</dt>
                  <dd dir="ltr">{configuration.defaultLocale}</dd>
                </div>
              </dl>
            </section>
          </>
        )}
      </Surface>
    </WorkspaceShell>
  );
}
import { featureLabel } from "./feature-label";
