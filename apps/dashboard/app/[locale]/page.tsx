import { formatNumber, formatTime, type Locale } from "@wlbp/i18n";
import { Badge, Surface } from "@wlbp/ui-foundation";
import { BrandShell } from "@wlbp/white-label-ui";
import Image from "next/image";
import Link from "next/link";
import { getDashboardMessage } from "../_lib/copy";
import { dashboardBrand } from "../_lib/brand";
import { SchedulePreview } from "./schedule-preview";

type DashboardPageProps = {
  params: Promise<{ locale: Locale }>;
};

export default async function DashboardPage({ params }: DashboardPageProps) {
  const { locale } = await params;
  const message = (key: Parameters<typeof getDashboardMessage>[1]) =>
    getDashboardMessage(locale, key);
  const navigation = [
    "navToday",
    "navCalendar",
    "navBookings",
    "navCustomers",
    "navBrand",
  ] as const;
  const timeZone = "Asia/Riyadh";

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
                key === "navBrand" ? `/${locale}/brand-preview` : `/${locale}#${key}`
              }
              aria-current={index === 0 ? "page" : undefined}
            >
              <span aria-hidden="true">0{index + 1}</span>
              {message(key)}
            </Link>
          ))}
        </nav>
        <Badge tone="positive">{message("status")}</Badge>
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

        <section className="metrics" aria-label={message("todaySummary")}>
          <Surface as="article" className="metric-card">
            <span>{message("metricArrivals")}</span>
            <strong>{formatNumber(8, locale, { minimumIntegerDigits: 2 })}</strong>
            <small>{formatNumber(2, locale, { signDisplay: "always" })}</small>
          </Surface>
          <Surface as="article" className="metric-card">
            <span>{message("metricRequests")}</span>
            <strong>{formatNumber(3, locale, { minimumIntegerDigits: 2 })}</strong>
            <small>{formatNumber(3, locale)}</small>
          </Surface>
          <Surface as="article" className="metric-card metric-card-alert">
            <span>{message("metricPayments")}</span>
            <strong>{formatNumber(1, locale, { minimumIntegerDigits: 2 })}</strong>
            <small>{formatNumber(1, locale)}</small>
          </Surface>
        </section>

        <SchedulePreview
          gridViewLabel={message("gridView")}
          items={[
            {
              dateTime: "2026-09-08T06:00:00.000Z",
              description: message("scheduleConsultation"),
              displayTime: formatTime("2026-09-08T06:00:00.000Z", locale, timeZone),
              status: message("statusConfirmed"),
              tone: "positive",
            },
            {
              dateTime: "2026-09-08T08:30:00.000Z",
              description: message("scheduleFollowUp"),
              displayTime: formatTime("2026-09-08T08:30:00.000Z", locale, timeZone),
              status: message("statusRequested"),
              tone: "warning",
            },
          ]}
          listAlternativeLabel={message("listAlternative")}
          listViewLabel={message("listView")}
          scheduleTitle={message("scheduleTitle")}
          timeZone={timeZone}
          timeZoneLabel={message("timeZoneLabel")}
          viewChangedGrid={message("viewChangedGrid")}
          viewChangedList={message("viewChangedList")}
          viewSelectorLabel={message("viewSelector")}
        />
      </div>
    </BrandShell>
  );
}
