import Link from "next/link";
import type { Locale } from "@wlbp/i18n";
import { loadDashboardRequestAccess } from "../../../_lib/dashboard-server";
import { WorkspaceShell } from "../../../_lib/workspace-shell";
import { DashboardAccessPanel } from "../../../_lib/dashboard-access-panel";
import { OnBehalfBookingForm } from "./booking-form";
import { bookingMessage } from "./booking-copy";
export const dynamic = "force-dynamic";
export default async function NewBookingPage({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}) {
  const { locale } = await params;
  const request = await loadDashboardRequestAccess(locale);
  let body;
  if (request.state.kind !== "ready")
    body = <DashboardAccessPanel locale={locale} state={request.state} />;
  else {
    const context = request.state.context;
    const loaded = await (async () => {
      try {
        if (!request.source?.getOperationalChoices) throw new Error();
        const choices = await request.source.getOperationalChoices(
          context.tenantId,
          locale,
        );
        return { choices };
      } catch {
        return null;
      }
    })();
    if (loaded) {
      const { choices } = loaded;
      body = (
        <OnBehalfBookingForm
          locale={locale}
          choices={choices}
          attempt={crypto.randomUUID()}
        />
      );
    } else {
      body = <p role="alert">{bookingMessage(locale, "unavailable")}</p>;
    }
  }
  return (
    <WorkspaceShell locale={locale} current="bookings" labelledBy="new-booking-title">
      <header className="dashboard-intro">
        <Link href={`/${locale}/bookings`}>{bookingMessage(locale, "back")}</Link>
        <h1 id="new-booking-title">{bookingMessage(locale, "title")}</h1>
        <p>{bookingMessage(locale, "intro")}</p>
      </header>
      {body}
    </WorkspaceShell>
  );
}
