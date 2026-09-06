import type { Locale } from "@wlbp/i18n";
import { Badge } from "@wlbp/ui-foundation";
import { BrandShell } from "@wlbp/white-label-ui";
import Image from "next/image";
import Link from "next/link";

import { dashboardBrand } from "../../_lib/brand";
import { getDashboardMessage } from "../../_lib/copy";
import { loadDashboardRequestAccess } from "../../_lib/dashboard-server";
import { getTeamResourcesMessage } from "../../_lib/team-resources-copy";
import { getTeamResourcesMetadata } from "../../_lib/team-resources-metadata";
import { parseTeamResourcesRetry } from "../../_lib/team-resources-retry";
import {
  loadTeamResourcesWorkspace,
  type TeamResourcesWorkspaceState,
} from "../../_lib/team-resources-workspace";
import {
  deactivateResourceAction,
  deactivateStaffAction,
  saveResourceAction,
  saveResourceTypeAction,
  saveStaffProfileAction,
  setResourceLocationEligibilityAction,
  setResourceRequirementAction,
  setStaffEligibilityAction,
} from "./actions";
import { TeamResourcesView } from "./team-resources-view";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

type TeamResourcesPageProps = {
  readonly params: Promise<{ locale: Locale }>;
  readonly searchParams: Promise<{
    result?: string;
    retryForm?: string;
    retryId?: string;
  }>;
};

export async function generateMetadata({ params }: TeamResourcesPageProps) {
  const { locale } = await params;
  return getTeamResourcesMetadata(locale);
}

async function loadPageState(locale: Locale): Promise<TeamResourcesWorkspaceState> {
  const request = await loadDashboardRequestAccess(locale);
  if (request.source === null || request.state.kind !== "ready") {
    return request.state.kind === "configuration-missing"
      ? { kind: "backend-unavailable" }
      : { kind: "access-unavailable", reason: "denied" };
  }
  return loadTeamResourcesWorkspace(request.state, request.source, locale);
}

export default async function TeamResourcesPage({
  params,
  searchParams,
}: TeamResourcesPageProps) {
  const { locale } = await params;
  const query = await searchParams;
  const retry = parseTeamResourcesRetry(query.retryForm, query.retryId);
  const state = await loadPageState(locale);
  const dashboardMessage = (key: Parameters<typeof getDashboardMessage>[1]) =>
    getDashboardMessage(locale, key);
  const teamMessage = (key: Parameters<typeof getTeamResourcesMessage>[1]) =>
    getTeamResourcesMessage(locale, key);

  return (
    <BrandShell
      className="dashboard-shell"
      labelledBy="team-resources-title"
      tokens={dashboardBrand.tokens}
    >
      <aside className="dashboard-sidebar">
        <Link
          aria-label={dashboardBrand.name}
          className="dashboard-brand"
          href={`/${locale}`}
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
        <nav aria-label={dashboardMessage("primaryNavigation")}>
          <Link href={`/${locale}`}>
            <span aria-hidden="true">01</span>
            {dashboardMessage("navToday")}
          </Link>
          <Link aria-current="page" href={`/${locale}/team-resources`}>
            <span aria-hidden="true">02</span>
            {teamMessage("title")}
          </Link>
        </nav>
        <Badge tone="positive">{dashboardMessage("privateStatus")}</Badge>
      </aside>

      <div className="dashboard-main">
        <header className="dashboard-toolbar">
          <Link href={`/${locale}`}>{teamMessage("backToWorkspace")}</Link>
          <nav aria-label={dashboardMessage("languageNavigation")}>
            <Link
              href="/en/team-resources"
              aria-current={locale === "en" ? "page" : undefined}
            >
              <span aria-hidden="true">EN</span>
              <span className="sr-only">{dashboardMessage("languageEnglish")}</span>
            </Link>
            <Link
              href="/ar/team-resources"
              aria-current={locale === "ar" ? "page" : undefined}
            >
              <span aria-hidden="true">عربي</span>
              <span className="sr-only">{dashboardMessage("languageArabic")}</span>
            </Link>
          </nav>
        </header>
        <TeamResourcesView
          actions={{
            deactivateResource: deactivateResourceAction,
            deactivateStaff: deactivateStaffAction,
            saveResource: saveResourceAction,
            saveResourceType: saveResourceTypeAction,
            saveStaffProfile: saveStaffProfileAction,
            setResourceLocationEligibility: setResourceLocationEligibilityAction,
            setResourceRequirement: setResourceRequirementAction,
            setStaffEligibility: setStaffEligibilityAction,
          }}
          locale={locale}
          {...(retry === undefined ? {} : { retry })}
          {...(query.result === "saved" ||
          query.result === "cancelled" ||
          query.result === "deactivated" ||
          query.result === "deferred" ||
          query.result === "reassigned" ||
          query.result === "invalid-request" ||
          query.result === "not-authorized" ||
          query.result === "revision-conflict" ||
          query.result === "backend-unavailable"
            ? { result: query.result }
            : {})}
          state={state}
        />
      </div>
    </BrandShell>
  );
}
