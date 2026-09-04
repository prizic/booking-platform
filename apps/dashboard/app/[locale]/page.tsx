import { formatNumber, formatTime, type Locale } from "@wlbp/i18n";
import { Badge, LinkButton, Surface } from "@wlbp/ui-foundation";
import { BrandShell } from "@wlbp/white-label-ui";
import Link from "next/link";
import { getDashboardMessage } from "../_lib/copy";

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
  ] as const;

  return (
    <BrandShell className="dashboard-shell" labelledBy="dashboard-title">
      <aside className="dashboard-sidebar">
        <Link
          className="dashboard-brand"
          href={`/${locale}`}
          aria-label={message("brandLabel")}
        >
          <span aria-hidden="true">N</span>
          <strong>Nawa</strong>
        </Link>
        <nav aria-label={message("primaryNavigation")}>
          {navigation.map((key, index) => (
            <Link
              key={key}
              href={`/${locale}#${key}`}
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

        <Surface as="section" className="schedule" labelledBy="schedule-title">
          <div className="schedule-heading">
            <div>
              <p>{message("listAlternative")}</p>
              <h2 id="schedule-title">{message("scheduleTitle")}</h2>
            </div>
            <LinkButton href={`/${locale}#calendar`} variant="secondary">
              {message("openCalendar")}
            </LinkButton>
          </div>
          <ol aria-label={message("listAlternative")}>
            <li>
              <time dateTime="09:00">
                {formatTime("2026-01-01T09:00:00.000Z", locale, "UTC")}
              </time>
              <span aria-hidden="true" />
              <p>{message("scheduleEmpty")}</p>
              <Badge>—</Badge>
            </li>
          </ol>
        </Surface>
      </div>
    </BrandShell>
  );
}
