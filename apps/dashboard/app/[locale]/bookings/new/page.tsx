import Link from "next/link";
import type { Locale } from "@wlbp/i18n";
import { Alert, AlertDescription, PageHeader } from "@wlbp/ui-foundation";
import { ArrowLeft } from "lucide-react";
import { loadDashboardRequestAccess } from "../../../_lib/dashboard-server";
import { WorkspaceShell } from "../../../_lib/workspace-shell";
import { textLinkClass } from "../../../_lib/ui/text-link";
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
  // The frame already explains a missing session, tenant or configuration.
  if (request.state.kind !== "ready") body = null;
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
      body = (
        <Alert tone="danger">
          <AlertDescription className="text-foreground">
            {bookingMessage(locale, "unavailable")}
          </AlertDescription>
        </Alert>
      );
    }
  }
  return (
    <WorkspaceShell locale={locale} current="bookings" labelledBy="new-booking-title">
      <div className="grid gap-4">
        <Link
          className={`${textLinkClass} inline-flex w-fit items-center gap-1.5 text-sm`}
          href={`/${locale}/bookings`}
        >
          <ArrowLeft aria-hidden="true" className="size-4 rtl:-scale-x-100" />
          {bookingMessage(locale, "back")}
        </Link>
        <PageHeader
          titleId="new-booking-title"
          title={bookingMessage(locale, "title")}
          description={bookingMessage(locale, "intro")}
        />
      </div>
      {body}
    </WorkspaceShell>
  );
}
