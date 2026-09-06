import { formatNumber, type Locale } from "@wlbp/i18n";
import { Badge, Surface } from "@wlbp/ui-foundation";
import { BrandShell } from "@wlbp/white-label-ui";
import Image from "next/image";
import Link from "next/link";

import type { DashboardAccessState } from "../_lib/dashboard-access";
import { dashboardBrand } from "../_lib/brand";
import { getDashboardMessage } from "../_lib/copy";
import { loadDashboardRequestAccess } from "../_lib/dashboard-server";
import { selectTenant } from "./actions";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

type DashboardPageProps = { params: Promise<{ locale: Locale }> };
type PageState = DashboardAccessState | { readonly kind: "configuration-missing" };

async function getPageState(locale: Locale): Promise<PageState> {
  return (await loadDashboardRequestAccess(locale)).state;
}

function AccessPanel({ locale, state }: { locale: Locale; state: PageState }) {
  const message = (key: Parameters<typeof getDashboardMessage>[1]) =>
    getDashboardMessage(locale, key);

  if (state.kind === "configuration-missing") {
    return (
      <Surface as="section" className="access-panel" aria-labelledby="access-title">
        <h2 id="access-title">{message("configurationTitle")}</h2>
        <p>{message("configurationSummary")}</p>
      </Surface>
    );
  }
  if (state.kind === "unauthenticated") {
    return (
      <Surface as="section" className="access-panel" aria-labelledby="access-title">
        <h2 id="access-title">{message("signInTitle")}</h2>
        <p>{message("signInSummary")}</p>
      </Surface>
    );
  }
  if (state.kind === "denied") {
    return (
      <Surface as="section" className="access-panel" aria-labelledby="access-title">
        <h2 id="access-title">{message("deniedTitle")}</h2>
        <p>{message("deniedSummary")}</p>
      </Surface>
    );
  }
  if (state.kind === "selection-required") {
    return (
      <Surface as="section" className="access-panel" aria-labelledby="access-title">
        <h2 id="access-title">{message("selectionTitle")}</h2>
        <p>{message("selectionSummary")}</p>
        <ul className="tenant-choice-list">
          {state.choices.map((choice) => (
            <li key={choice.membershipId}>
              <form action={selectTenant}>
                <input name="locale" type="hidden" value={locale} />
                <input name="tenantId" type="hidden" value={choice.tenantId} />
                <span>
                  <strong>{choice.tenantName}</strong>
                  <small>{choice.roleKey}</small>
                </span>
                <button className="wlbp-button" type="submit">
                  {message("selectTenant")}
                </button>
              </form>
            </li>
          ))}
        </ul>
      </Surface>
    );
  }

  return (
    <section aria-labelledby="workspace-context-title">
      <h2 id="workspace-context-title">{message("workspaceTitle")}</h2>
      <div className="metrics">
        <Surface as="article" className="metric-card">
          <span>{message("tenantLabel")}</span>
          <strong>{state.context.tenantName}</strong>
          <small>{state.context.roleKey}</small>
        </Surface>
        <Surface as="article" className="metric-card">
          <span>{message("locationsLabel")}</span>
          <strong>{formatNumber(state.context.locationIds.length, locale)}</strong>
          <small>
            {message("roleLabel")}: {state.context.roleKey}
          </small>
        </Surface>
        <Surface as="article" className="metric-card">
          <span>{message("capabilitiesLabel")}</span>
          <strong>{formatNumber(state.context.grants.length, locale)}</strong>
          <small>
            {state.context.aal2 ? message("mfaVerified") : message("mfaNotVerified")}
          </small>
        </Surface>
      </div>
      {state.choices.length > 1 ? (
        <Surface
          as="section"
          className="access-panel"
          aria-labelledby="tenant-switcher-title"
        >
          <h3 id="tenant-switcher-title">{message("selectionTitle")}</h3>
          <p>{message("selectionSummary")}</p>
          <ul className="tenant-choice-list">
            {state.choices.map((choice) => (
              <li key={choice.membershipId}>
                <form action={selectTenant}>
                  <input name="locale" type="hidden" value={locale} />
                  <input name="tenantId" type="hidden" value={choice.tenantId} />
                  <span>
                    <strong>{choice.tenantName}</strong>
                    <small>{choice.roleKey}</small>
                  </span>
                  <button
                    className="wlbp-button"
                    disabled={choice.tenantId === state.context.tenantId}
                    type="submit"
                  >
                    {message("selectTenant")}
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </Surface>
      ) : null}
    </section>
  );
}

export default async function DashboardPage({ params }: DashboardPageProps) {
  const { locale } = await params;
  const state = await getPageState(locale);
  const message = (key: Parameters<typeof getDashboardMessage>[1]) =>
    getDashboardMessage(locale, key);
  const navigation = [
    "navToday",
    "navCalendar",
    "navBookings",
    "navCustomers",
    "navTeamResources",
    "navAvailability",
    "navBrand",
  ] as const;

  return (
    <BrandShell
      className="dashboard-shell"
      labelledBy="dashboard-title"
      tokens={dashboardBrand.tokens}
    >
      <aside className="dashboard-sidebar">
        <Link
          className="dashboard-brand"
          href={`/${locale}`}
          aria-label={dashboardBrand.name}
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
        <nav aria-label={message("primaryNavigation")}>
          {navigation.map((key, index) => (
            <Link
              key={key}
              href={
                key === "navBrand"
                  ? `/${locale}/brand-preview`
                  : key === "navTeamResources"
                    ? `/${locale}/team-resources`
                    : key === "navAvailability"
                      ? `/${locale}/availability`
                      : `/${locale}#${key}`
              }
              aria-current={index === 0 ? "page" : undefined}
            >
              <span aria-hidden="true">0{index + 1}</span>
              {message(key)}
            </Link>
          ))}
        </nav>
        <Badge tone="positive">{message("privateStatus")}</Badge>
      </aside>

      <div className="dashboard-main">
        <header className="dashboard-toolbar">
          <p>{message("eyebrow")}</p>
          <nav aria-label={message("languageNavigation")}>
            <Link aria-current={locale === "en" ? "page" : undefined} href="/en">
              <span aria-hidden="true">EN</span>
              <span className="sr-only">{message("languageEnglish")}</span>
            </Link>
            <Link aria-current={locale === "ar" ? "page" : undefined} href="/ar">
              <span aria-hidden="true">عربي</span>
              <span className="sr-only">{message("languageArabic")}</span>
            </Link>
          </nav>
        </header>

        <section className="dashboard-intro" aria-labelledby="dashboard-title">
          <h1 id="dashboard-title">{message("title")}</h1>
          <p>{message("summary")}</p>
        </section>

        <AccessPanel locale={locale} state={state} />
      </div>
    </BrandShell>
  );
}
