import { workspaceStatus } from "../../../_lib/workspace-status";
import type { Locale } from "@wlbp/i18n";
import {
  Alert,
  AlertDescription,
  Badge,
  Button,
  EmptyState,
  Facts,
  Field,
  Label,
  PageHeader,
  ReferenceCode,
  Section,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  StatusStamp,
  Textarea,
} from "@wlbp/ui-foundation";
import { ArrowLeft, StickyNote } from "lucide-react";
import Link from "next/link";

import type { BookingDetailV1 } from "../../../_lib/dashboard-access";
import { getDashboardMessage } from "../../../_lib/copy";
import { loadDashboardRequestAccess } from "../../../_lib/dashboard-server";
import { WorkspaceShell } from "../../../_lib/workspace-shell";
import { formatCount, stampStateFor } from "../../../_lib/booking-display";
import { countLabel, workspaceMessage } from "../../../_lib/workspace-copy";
import { ResultAlert } from "../../../_lib/ui/result-alert";
import { textLinkClass } from "../../../_lib/ui/text-link";
import { Money } from "../../../_lib/ui/money";
import { ServiceDye } from "../../../_lib/ui/service-dye";
import { When } from "../../../_lib/ui/when";
import { ZoneNote } from "../../../_lib/ui/zone-note";
import { addBookingNoteAction, transitionBookingAction } from "../actions";
import { detailResultKeys, positiveResults } from "../results";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

type BookingDetailPageProps = {
  readonly params: Promise<{ bookingId: string; locale: Locale }>;
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
};

// Every action is offered; the database decides which one this booking can
// actually make. Hiding a control is presentation, never authorization, and a
// hidden control would also hide the honest refusal that teaches an operator
// what state the booking is really in.
const actions = [
  { key: "check_in", label: "detailCheckIn" },
  { key: "complete", label: "detailComplete" },
  { key: "no_show", label: "detailNoShow" },
  { key: "correct", label: "detailCorrect" },
] as const;

const actorKeys = {
  staff: "actorStaff",
  guest: "actorGuest",
  system: "actorSystem",
  worker: "actorWorker",
} as const;

async function loadDetail(
  locale: Locale,
  bookingId: string,
): Promise<BookingDetailV1 | null> {
  const request = await loadDashboardRequestAccess(locale);
  if (
    request.source === null ||
    request.state.kind !== "ready" ||
    request.source.getBookingDetail === undefined
  ) {
    return null;
  }
  return request.source
    .getBookingDetail({ bookingId, tenantId: request.state.context.tenantId })
    .catch(() => null);
}

export default async function BookingDetailPage({
  params,
  searchParams,
}: BookingDetailPageProps) {
  const { bookingId, locale } = await params;
  const query = await searchParams;
  const booking = await loadDetail(locale, bookingId);
  const access = await loadDashboardRequestAccess(locale);
  const customerId =
    booking && access.state.kind === "ready"
      ? await access.source
          ?.getBookingCustomer?.(access.state.context.tenantId, bookingId)
          .catch(() => null)
      : null;
  const message = (key: Parameters<typeof getDashboardMessage>[1]) =>
    getDashboardMessage(locale, key);
  const result = typeof query.result === "string" ? query.result : null;
  const resultKey =
    result !== null && result in detailResultKeys
      ? detailResultKeys[result as keyof typeof detailResultKeys]
      : null;
  const hidden = message("detailContactHidden");

  return (
    <WorkspaceShell current="bookings" labelledBy="detail-title" locale={locale}>
      <div className="grid gap-4">
        <Link
          className={`${textLinkClass} inline-flex w-fit items-center gap-1.5 text-sm`}
          href={`/${locale}/bookings`}
        >
          <ArrowLeft aria-hidden="true" className="size-4 rtl:-scale-x-100" />
          {message("detailBackToList")}
        </Link>
        <PageHeader
          titleId="detail-title"
          title={
            booking === null ? (
              message("detailTitle")
            ) : (
              <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <ServiceDye name={booking.serviceName} />
                <ReferenceCode size="lg">{booking.publicReference}</ReferenceCode>
              </span>
            )
          }
          meta={
            booking === null ? null : (
              <>
                {/* Status is words, never colour alone. */}
                <StatusStamp state={stampStateFor(booking.status)}>
                  {workspaceStatus(locale, booking.status)}
                </StatusStamp>
                <When
                  className="text-sm text-muted-foreground"
                  instant={booking.startAt}
                  locale={locale}
                  timeZone={booking.locationTimeZone}
                />
                <ZoneNote locale={locale} timeZone={booking.locationTimeZone} />
              </>
            )
          }
        />
      </div>
      {resultKey === null ? null : (
        <ResultAlert positive={positiveResults.has(result ?? "")}>
          {message(resultKey)}
        </ResultAlert>
      )}

      {booking === null ? (
        <Alert tone="danger">
          <AlertDescription className="text-foreground">
            {message("detailUnavailable")}
          </AlertDescription>
        </Alert>
      ) : (
        <>
          <nav aria-label={workspaceMessage(locale, "relatedPages")}>
            <ul className="flex flex-wrap gap-2">
              {customerId ? (
                <li>
                  <Button asChild variant="outline">
                    <Link href={`/${locale}/customers/${customerId}`}>
                      {message("detailCustomerLabel")}
                    </Link>
                  </Button>
                </li>
              ) : (
                <li className="flex min-h-11 items-center px-1 text-sm text-muted-foreground">
                  {hidden}
                </li>
              )}
              <li>
                <Button asChild variant="outline">
                  <Link href={`/${locale}/payments`}>
                    {message("detailPaymentLabel")}
                  </Link>
                </Button>
              </li>
              <li>
                <Button asChild variant="outline">
                  <Link href={`/${locale}/communications`}>
                    {message("navCommunications")}
                  </Link>
                </Button>
              </li>
              <li>
                <Button asChild variant="ghost">
                  <a href="#detail-history">{message("detailHistoryTitle")}</a>
                </Button>
              </li>
            </ul>
          </nav>

          <Facts
            columns={3}
            className="rounded-lg border bg-card p-5"
            items={[
              {
                key: "when",
                label: message("bookingsWhenLabel"),
                value: (
                  <When
                    instant={booking.startAt}
                    locale={locale}
                    timeZone={booking.locationTimeZone}
                  />
                ),
              },
              {
                key: "duration",
                label: message("detailDurationLabel"),
                value: countLabel(locale, "minutes", booking.durationMinutes),
              },
              {
                key: "location",
                label: message("detailLocationLabel"),
                value: booking.locationName,
              },
              {
                key: "payment",
                label: message("detailPaymentLabel"),
                value: workspaceStatus(locale, booking.paymentStatus),
              },
              {
                key: "delivery",
                label: message("bookingsDeliveryLabel"),
                value: workspaceStatus(locale, booking.notificationStatus),
              },
              {
                key: "price",
                label: message("detailPriceLabel"),
                value: (
                  <Money
                    minor={booking.priceMinor}
                    currency={booking.currency}
                    locale={locale}
                  />
                ),
              },
              {
                key: "reschedules",
                label: message("detailRescheduleCountLabel"),
                value: formatCount(booking.rescheduleCount, locale),
              },
              ...(booking.cancelledAt === null
                ? []
                : [
                    {
                      key: "cancelled",
                      label: message("detailCancelledAtLabel"),
                      value: (
                        <When
                          instant={booking.cancelledAt}
                          locale={locale}
                          timeZone={booking.locationTimeZone}
                        />
                      ),
                    },
                  ]),
              ...(booking.refundEligibleMinor === null
                ? []
                : [
                    {
                      key: "refund",
                      label: message("detailRefundLabel"),
                      value: (
                        <Money
                          minor={booking.refundEligibleMinor}
                          currency={booking.currency}
                          locale={locale}
                        />
                      ),
                    },
                  ]),
              {
                key: "customer",
                label: message("detailCustomerLabel"),
                // Absent, not blanked: the read never carried it.
                value: booking.customerFullName ?? hidden,
              },
              {
                key: "email",
                label: message("detailEmailLabel"),
                value:
                  booking.customerEmail === null ? (
                    hidden
                  ) : (
                    <bdi>{booking.customerEmail}</bdi>
                  ),
              },
              {
                key: "phone",
                label: message("detailPhoneLabel"),
                value:
                  booking.customerPhone === null ? (
                    hidden
                  ) : (
                    <bdi dir="ltr">{booking.customerPhone}</bdi>
                  ),
              },
              {
                key: "intake",
                label: message("bookingsListLabel"),
                value: booking.hasIntake
                  ? message("detailIntakePresent")
                  : message("detailIntakeAbsent"),
              },
            ]}
          />

          <Section
            id="detail-actions"
            title={message("detailLifecycleTitle")}
            description={message("detailLifecycleHint")}
          >
            <form
              action={transitionBookingAction}
              aria-label={workspaceMessage(locale, "lifecycleActions")}
              className="grid max-w-2xl gap-4"
            >
              <input type="hidden" name="locale" value={locale} />
              <input type="hidden" name="bookingId" value={booking.bookingId} />
              <input
                type="hidden"
                name="expectedRevision"
                value={booking.bookingRevision}
              />
              <Field>
                <Label htmlFor="transition-reason">
                  {message("detailReasonLabel")}
                </Label>
                <Textarea
                  id="transition-reason"
                  maxLength={500}
                  name="reason"
                  rows={2}
                />
              </Field>
              <div className="flex flex-wrap gap-2">
                {actions.map((action) => (
                  <Button
                    key={action.key}
                    name="action"
                    type="submit"
                    value={action.key}
                    variant={action.key === "check_in" ? "default" : "outline"}
                  >
                    {message(action.label)}
                  </Button>
                ))}
              </div>
            </form>
          </Section>

          <div className="grid items-start gap-8 lg:grid-cols-2">
            <Section id="detail-history" title={message("detailHistoryTitle")}>
              <ol className="grid gap-0 border-s-2 border-border ps-5">
                {booking.history.map((entry) => (
                  <li
                    key={entry.sequence}
                    className="relative grid gap-1 pb-5 last:pb-0"
                  >
                    <span
                      aria-hidden="true"
                      className="absolute -start-[1.6rem] top-1.5 size-2.5 rounded-full border-2 border-card bg-primary"
                    />
                    <h3 className="text-sm font-semibold">
                      {workspaceMessage(locale, "bookingChange")} ·{" "}
                      <bdi className="font-latin text-muted-foreground">
                        {entry.eventType}
                      </bdi>
                    </h3>
                    <dl className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                      <div className="flex gap-1.5">
                        <dt className="sr-only">{message("bookingsWhenLabel")}</dt>
                        <dd>
                          <When
                            instant={entry.createdAt}
                            locale={locale}
                            timeZone={booking.locationTimeZone}
                          />
                        </dd>
                      </div>
                      <div className="flex gap-1.5">
                        <dt>{message("detailHistoryActorLabel")}:</dt>
                        <dd className="text-foreground">
                          {workspaceMessage(
                            locale,
                            actorKeys[entry.actorKind as keyof typeof actorKeys] ??
                              "actorUnknown",
                          )}
                        </dd>
                      </div>
                    </dl>
                    {entry.reason === null ? null : (
                      <p className="text-sm text-foreground">{entry.reason}</p>
                    )}
                  </li>
                ))}
              </ol>
            </Section>

            <Section id="detail-notes" title={message("detailNotesTitle")}>
              {booking.notes.length === 0 ? (
                <EmptyState
                  icon={<StickyNote aria-hidden="true" />}
                  title={message("detailNotesEmpty")}
                />
              ) : (
                <ul className="divide-y rounded-lg border bg-card">
                  {booking.notes.map((note) => (
                    <li key={note.noteId} className="grid gap-2 px-4 py-3">
                      <Badge
                        tone={note.visibility === "sensitive" ? "warning" : "neutral"}
                      >
                        {message(
                          note.visibility === "sensitive"
                            ? "detailNoteSensitive"
                            : "detailNoteOperational",
                        )}
                      </Badge>
                      <p className="text-sm whitespace-pre-line">{note.body}</p>
                    </li>
                  ))}
                </ul>
              )}

              <form
                action={addBookingNoteAction}
                aria-labelledby="detail-add-note-title"
                className="grid gap-4 border-t pt-4"
              >
                <h3 id="detail-add-note-title" className="text-base font-semibold">
                  {message("detailAddNoteTitle")}
                </h3>
                <input type="hidden" name="locale" value={locale} />
                <input type="hidden" name="bookingId" value={booking.bookingId} />
                <Field>
                  <Label htmlFor="note-body">{message("detailNoteBodyLabel")}</Label>
                  <Textarea id="note-body" maxLength={2000} name="body" rows={3} />
                </Field>
                <Field>
                  <Label htmlFor="note-visibility">
                    {message("detailNoteVisibilityLabel")}
                  </Label>
                  <Select name="visibility" defaultValue="operational">
                    <SelectTrigger id="note-visibility">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="operational">
                        {message("detailNoteOperational")}
                      </SelectItem>
                      <SelectItem value="sensitive">
                        {message("detailNoteSensitive")}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Button type="submit" className="w-fit">
                  {message("detailAddNote")}
                </Button>
              </form>
            </Section>
          </div>
        </>
      )}
    </WorkspaceShell>
  );
}
