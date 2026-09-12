import type { Locale } from "@wlbp/i18n";
import { Badge } from "@wlbp/ui-foundation";
import { BrandShell } from "@wlbp/white-label-ui";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

import { dashboardBrand } from "./brand";
import { getDashboardMessage } from "./copy";

const sections = [
  { key: "navToday", path: "today" },
  { key: "navCalendar", path: "calendar" },
  { key: "navBookings", path: "bookings" },
  { key: "navCustomers", path: "customers" },
  { key: "navPayments", path: "payments" },
  { key: "navRequests", path: "requests" },
  { key: "navTeamResources", path: "team-resources" },
  { key: "navAvailability", path: "availability" },
] as const;

/**
 * The chrome every workspace surface shares: brand, primary navigation with the
 * current section marked, the private-view badge, and the language pair. Kept
 * in one place so a new surface cannot drift from the others.
 */
export function WorkspaceShell({
  children,
  current,
  labelledBy,
  locale,
}: {
  readonly children: ReactNode;
  readonly current: (typeof sections)[number]["path"];
  readonly labelledBy: string;
  readonly locale: Locale;
}) {
  const message = (key: Parameters<typeof getDashboardMessage>[1]) =>
    getDashboardMessage(locale, key);

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
        <nav aria-label={message("primaryNavigation")}>
          {sections.map((section, index) => (
            <Link
              aria-current={section.path === current ? "page" : undefined}
              href={`/${locale}/${section.path}`}
              key={section.path}
            >
              <span aria-hidden="true">0{index + 1}</span>
              {message(section.key)}
            </Link>
          ))}
        </nav>
        <Badge tone="positive">{message("privateStatus")}</Badge>
      </aside>

      <div className="dashboard-main">
        <header className="dashboard-toolbar">
          <Link href={`/${locale}`}>{message("navToday")}</Link>
          <nav aria-label={message("languageNavigation")}>
            <Link
              aria-current={locale === "en" ? "page" : undefined}
              href={`/en/${current}`}
            >
              <span aria-hidden="true">EN</span>
              <span className="sr-only">{message("languageEnglish")}</span>
            </Link>
            <Link
              aria-current={locale === "ar" ? "page" : undefined}
              href={`/ar/${current}`}
            >
              <span aria-hidden="true">عربي</span>
              <span className="sr-only">{message("languageArabic")}</span>
            </Link>
          </nav>
        </header>
        {children}
      </div>
    </BrandShell>
  );
}
