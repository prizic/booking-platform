import type { Locale } from "@wlbp/i18n";
import {
  AppShell,
  Button,
  DualDate,
  ThemeToggle,
  type ShellNavGroup,
} from "@wlbp/ui-foundation";
import { THEME_COOKIE, resolveTheme } from "@wlbp/ui-foundation/preferences";
import {
  BellRing,
  CalendarClock,
  CalendarDays,
  ChartColumn,
  ClipboardList,
  Clock,
  CreditCard,
  Inbox,
  Layers,
  LogIn,
  LogOut,
  Mail,
  MapPin,
  Palette,
  Plug,
  ScrollText,
  Settings,
  ShieldCheck,
  Tags,
  Users,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import { cookies } from "next/headers";
import Image from "next/image";
import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { dashboardBrand } from "./brand";
import { getDashboardMessage } from "./copy";
import { formatCount } from "./booking-display";
import { instanceText } from "./instance-text";
import {
  getWorkspaceNavigation,
  implementedWorkspaceSections,
  type WorkspaceGroup,
  type WorkspaceSection,
} from "./workspace-navigation";
import { WorkspaceLocaleNavigation } from "./workspace-locale-navigation";
import {
  WorkspaceLiveGate,
  WorkspaceLiveStatus,
  WorkspaceLiveUpdates,
} from "./workspace-live-updates";
import {
  getDashboardRuntimeConfiguration,
  loadDashboardRequestAccess,
} from "./dashboard-server";
import { DashboardAccessPanel } from "./dashboard-access-panel";
import { countLabel, workspaceMessage } from "./workspace-copy";
import { notificationText } from "./notification-copy";

const sectionIcons: Record<WorkspaceSection, LucideIcon> = {
  today: CalendarClock,
  calendar: CalendarDays,
  bookings: ClipboardList,
  requests: Inbox,
  customers: Users,
  payments: CreditCard,
  communications: Mail,
  reports: ChartColumn,
  services: Layers,
  categories: Tags,
  locations: MapPin,
  "team-resources": UsersRound,
  availability: Clock,
  brand: Palette,
  integrations: Plug,
  settings: Settings,
  audit: ScrollText,
  roles: ShieldCheck,
};

const groupLabels = {
  operations: "workspaceOperations",
  catalog: "workspaceCatalog",
  administration: "workspaceAdministration",
} as const satisfies Record<WorkspaceGroup, Parameters<typeof getDashboardMessage>[1]>;

const liveSections: readonly WorkspaceSection[] = [
  "today",
  "calendar",
  "bookings",
  "requests",
];

/**
 * The tenant workspace frame: the brand rail with grouped navigation, a top
 * bar with the day (Gregorian and Hijri), live status, theme and language,
 * and the page. Pages keep their own one h1, labelled by `labelledBy`.
 */
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
  const request = await loadDashboardRequestAccess(locale);
  const { state } = request;
  const configuration = getDashboardRuntimeConfiguration();
  const authenticated = state.kind === "ready" || state.kind === "selection-required";
  const navigation = getWorkspaceNavigation({ locale, current, enabledSections });
  const tenantId = state.kind === "ready" ? state.context.tenantId : null;

  // Both reads are optional decoration: a failure leaves the badge off and the
  // date in the platform default zone, never an error in the frame.
  const [choices, pendingRequests] =
    tenantId !== null && request.source !== null
      ? await Promise.all([
          request.source.getOperationalChoices?.(tenantId, locale).catch(() => null) ??
            null,
          request.source.listBookingRequests?.(tenantId).catch(() => null) ?? null,
        ])
      : [null, null];
  const timeZone = choices?.offers[0]?.timeZone ?? "Asia/Riyadh";
  const pendingCount = pendingRequests?.length ?? 0;

  const darkAvailable = dashboardBrand.tokens.colorDark !== undefined;
  const theme = resolveTheme(
    (await cookies()).get(THEME_COOKIE)?.value,
    dashboardBrand.appearance.defaultTheme,
    darkAvailable,
  );
  const brandName = instanceText(locale)("brand.name");
  const preferencesLabel = notificationText(locale, "commsNavPreferences");

  const groups: ShellNavGroup[] = (["operations", "catalog", "administration"] as const)
    .map((group) => ({
      label: message(groupLabels[group]),
      items: navigation
        .filter((item) => item.group === group)
        .map((item) => {
          const Icon = sectionIcons[item.section];
          return {
            href: item.href,
            label: item.label,
            current: item.active,
            icon: <Icon aria-hidden="true" />,
            badge:
              item.section === "requests" && pendingCount > 0 ? (
                <>
                  <span aria-hidden="true">{formatCount(pendingCount, locale)}</span>
                  <span className="sr-only">
                    {countLabel(locale, "requests", pendingCount)}
                  </span>
                </>
              ) : undefined,
          };
        }),
    }))
    .filter((group) => group.items.length > 0);

  const brand = (
    <Link
      href={`/${locale}/today`}
      className="flex min-w-0 items-center gap-3 rounded-md text-rail-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring/60"
    >
      <Image
        alt=""
        aria-hidden="true"
        height={32}
        src={dashboardBrand.assets.icon}
        width={32}
        className="size-8 shrink-0 rounded-md"
      />
      <span className="grid min-w-0 leading-tight">
        <span className="truncate text-[0.9375rem] font-bold">{brandName}</span>
        <span className="truncate text-xs text-rail-muted">
          {message("privateStatus")}
        </span>
      </span>
    </Link>
  );

  const now = new Date();
  const shortDate = (calendar?: "islamic-umalqura") => {
    const tag =
      locale === "ar"
        ? `ar-u-${calendar ? `ca-${calendar}-` : ""}nu-arab`
        : `en${calendar ? `-u-ca-${calendar}` : ""}`;
    return new Intl.DateTimeFormat(tag, {
      day: "numeric",
      month: "short",
      timeZone,
    }).format(now);
  };

  // The light-ground brand for the top bar below lg, where the rail is a sheet:
  // the name with a compact Gregorian · Hijri date stacked beneath it.
  const mobileBrand = (
    <Link
      href={`/${locale}/today`}
      className="flex min-w-0 items-center gap-2 rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-ring/60"
    >
      <Image
        alt=""
        aria-hidden="true"
        height={28}
        src={dashboardBrand.assets.icon}
        width={28}
        className="size-7 shrink-0 rounded-md"
      />
      <span className="grid min-w-0 leading-tight">
        <span className="truncate text-sm font-bold text-foreground">{brandName}</span>
        <time
          dateTime={now.toISOString()}
          className="truncate text-xs text-muted-foreground"
        >
          {shortDate()} · {shortDate("islamic-umalqura")}
        </time>
      </span>
    </Link>
  );

  // Below lg the sheet's footer carries language, account and sign-out; from
  // lg up those live in the top bar, so the rail repeats none of them.
  const railFooter = (
    <div className="grid gap-1 lg:hidden">
      <Suspense fallback={null}>
        <div className="pb-2">
          <WorkspaceLocaleNavigation locale={locale} tone="rail" />
        </div>
      </Suspense>
      {state.kind === "ready" ? (
        <div className="pb-2 md:hidden">
          <DashboardAccessPanel locale={locale} state={state} />
        </div>
      ) : null}
      {authenticated ? (
        <>
          <Button asChild variant="rail" block>
            <Link href={`/${locale}/auth/mfa`}>
              <ShieldCheck aria-hidden="true" />
              {message("authAccount")}
            </Link>
          </Button>
          <Button asChild variant="rail" block>
            <Link href={`/${locale}/communications/preferences`}>
              <BellRing aria-hidden="true" />
              {preferencesLabel}
            </Link>
          </Button>
          {/* Signing out stays a POST so a prefetch or a crawler can never do it. */}
          <form action={`/${locale}/auth/sign-out`} method="post">
            <Button type="submit" variant="rail" block>
              <LogOut aria-hidden="true" className="rtl:-scale-x-100" />
              {message("authSignOut")}
            </Button>
          </form>
        </>
      ) : (
        <Button asChild variant="rail" block>
          <Link href={`/${locale}/auth/sign-in`}>
            <LogIn aria-hidden="true" className="rtl:-scale-x-100" />
            {message("authSignIn")}
          </Link>
        </Button>
      )}
    </div>
  );

  const topbar = (
    <>
      <DualDate
        date={now}
        locale={locale}
        timeZone={timeZone}
        className="me-auto hidden min-w-0 lg:flex"
      />
      {state.kind === "ready" ? (
        <div className="hidden md:block">
          <DashboardAccessPanel locale={locale} state={state} />
        </div>
      ) : null}
      <WorkspaceLiveStatus />
      {darkAvailable ? (
        <ThemeToggle
          initialTheme={theme}
          labels={{
            toDark: workspaceMessage(locale, "themeToDark"),
            toLight: workspaceMessage(locale, "themeToLight"),
          }}
        />
      ) : null}
      <Suspense fallback={null}>
        <div className="hidden md:block">
          <WorkspaceLocaleNavigation locale={locale} />
        </div>
      </Suspense>
      {authenticated ? (
        <div className="hidden items-center gap-1 lg:flex">
          <Button asChild variant="ghost" size="icon">
            <Link
              href={`/${locale}/communications/preferences`}
              aria-label={preferencesLabel}
              title={preferencesLabel}
            >
              <BellRing aria-hidden="true" />
            </Link>
          </Button>
          <Button asChild variant="ghost" size="icon">
            <Link
              href={`/${locale}/auth/mfa`}
              aria-label={message("authAccount")}
              title={message("authAccount")}
            >
              <ShieldCheck aria-hidden="true" />
            </Link>
          </Button>
          {/* Signing out stays a POST so a prefetch or a crawler can never do it. */}
          <form action={`/${locale}/auth/sign-out`} method="post">
            <Button type="submit" variant="outline" size="sm">
              <LogOut aria-hidden="true" className="rtl:-scale-x-100" />
              {message("authSignOut")}
            </Button>
          </form>
        </div>
      ) : null}
    </>
  );

  const frame = (
    <AppShell
      brand={brand}
      groups={groups}
      sheetFooter={railFooter}
      mobileBrand={mobileBrand}
      topbar={topbar}
      labels={{
        navigation: message("primaryNavigation"),
        openMenu: workspaceMessage(locale, "openMenu"),
        closeMenu: workspaceMessage(locale, "closeMenu"),
        skipToContent: workspaceMessage(locale, "skipToContent"),
      }}
    >
      {state.kind === "ready" ? null : (
        <DashboardAccessPanel locale={locale} state={state} />
      )}
      <section
        aria-labelledby={labelledBy}
        className="grid min-w-0 content-start gap-8"
      >
        <WorkspaceLiveGate>{children}</WorkspaceLiveGate>
      </section>
    </AppShell>
  );

  return state.kind === "ready" && configuration && liveSections.includes(current) ? (
    <WorkspaceLiveUpdates
      tenantId={state.context.tenantId}
      locale={locale}
      configuration={{
        url: configuration.supabaseUrl,
        publishableKey: configuration.supabasePublishableKey,
      }}
      enabled={process.env.NEXT_PUBLIC_DASHBOARD_REALTIME_ENABLED === "true"}
    >
      {frame}
    </WorkspaceLiveUpdates>
  ) : (
    frame
  );
}
