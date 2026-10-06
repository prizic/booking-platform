import type { Locale } from "@wlbp/i18n";
import { Badge } from "@wlbp/ui-foundation";
import { BrandShell } from "@wlbp/white-label-ui";
import Image from "next/image";
import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { dashboardBrand } from "./brand";
import { getDashboardMessage } from "./copy";
import {
  getWorkspaceNavigation,
  implementedWorkspaceSections,
  type WorkspaceSection,
} from "./workspace-navigation";
import { WorkspaceLocaleNavigation } from "./workspace-locale-navigation";
import { WorkspaceLiveUpdates } from "./workspace-live-updates";
import { getDashboardRuntimeConfiguration } from "./dashboard-server";
import { loadDashboardRequestAccess } from "./dashboard-server";
import { DashboardAccessPanel } from "./dashboard-access-panel";
import { WorkspaceMobileMenu } from "./workspace-mobile-menu";

export async function WorkspaceShell({
  children,
  current,
  labelledBy,
  locale,
  enabledSections = implementedWorkspaceSections,
}: {
  readonly children: ReactNode;
  readonly current: WorkspaceSection;
  readonly labelledBy: string;
  readonly locale: Locale;
  readonly enabledSections?: readonly WorkspaceSection[];
}) {
  const message = (key: Parameters<typeof getDashboardMessage>[1]) =>
    getDashboardMessage(locale, key);
  const { state } = await loadDashboardRequestAccess(locale);
  const configuration = getDashboardRuntimeConfiguration();
  const authenticated = state.kind === "ready" || state.kind === "selection-required";
  const navigation = getWorkspaceNavigation({ locale, current, enabledSections });
  return (
    <BrandShell
      className="dashboard-shell"
      labelledBy={labelledBy}
      tokens={dashboardBrand.tokens}
    >
      <aside className="dashboard-sidebar">
        <Link
          aria-label={dashboardBrand.name}
          className="dashboard-brand"
          href={`/${locale}/today`}
        >
          <Image
            alt=""
            aria-hidden="true"
            height={36}
            src={dashboardBrand.assets.icon}
            width={36}
          />
          <strong>{dashboardBrand.name}</strong>
        </Link>
        <WorkspaceMobileMenu
          label={message("workspaceMenu")}
          currentLabel={navigation.find((item) => item.active)?.label ?? ""}
        >
          <nav aria-label={message("primaryNavigation")}>
            {(["operations", "catalog", "administration"] as const).map((group) => (
              <div className="workspace-nav-group" key={group}>
                <h2>
                  {message(
                    group === "operations"
                      ? "workspaceOperations"
                      : group === "catalog"
                        ? "workspaceCatalog"
                        : "workspaceAdministration",
                  )}
                </h2>
                {navigation
                  .filter((item) => item.group === group)
                  .map((item) => (
                    <Link
                      key={item.section}
                      aria-current={item.active ? "page" : undefined}
                      href={item.href}
                    >
                      {item.label}
                    </Link>
                  ))}
              </div>
            ))}
          </nav>
        </WorkspaceMobileMenu>
        <Badge>{message("privateStatus")}</Badge>
      </aside>
      <div className="dashboard-main">
        <header className="dashboard-toolbar">
          <Link href={`/${locale}/today`}>{message("navToday")}</Link>
          <div className="workspace-account">
            {authenticated ? (
              <>
                <Link href={`/${locale}/auth/mfa`}>{message("authAccount")}</Link>
                <form action={`/${locale}/auth/sign-out`} method="post">
                  <button className="wlbp-button wlbp-button--quiet" type="submit">
                    {message("authSignOut")}
                  </button>
                </form>
              </>
            ) : (
              <Link href={`/${locale}/auth/sign-in`}>{message("authSignIn")}</Link>
            )}
            <Suspense fallback={null}>
              <WorkspaceLocaleNavigation locale={locale} />
            </Suspense>
          </div>
        </header>
        <DashboardAccessPanel locale={locale} state={state} />
        {state.kind === "ready" &&
        configuration &&
        ["today", "calendar", "bookings", "requests"].includes(current) ? (
          <WorkspaceLiveUpdates
            tenantId={state.context.tenantId}
            locale={locale}
            configuration={{
              url: configuration.supabaseUrl,
              publishableKey: configuration.supabasePublishableKey,
            }}
            enabled={process.env.NEXT_PUBLIC_DASHBOARD_REALTIME_ENABLED === "true"}
          >
            {children}
          </WorkspaceLiveUpdates>
        ) : (
          children
        )}
      </div>
    </BrandShell>
  );
}
