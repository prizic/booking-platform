import { workspaceStatus } from "../../_lib/workspace-status";
import type { Locale } from "@wlbp/i18n";
import {
  Alert,
  AlertDescription,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  EmptyState,
  Field,
  Input,
  Label,
  PageHeader,
  ReferenceCode,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  StatusStamp,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Toolbar,
} from "@wlbp/ui-foundation";
import { CalendarClock, CalendarX, Search } from "lucide-react";
import Link from "next/link";

import { getDashboardMessage } from "../../_lib/copy";
import type { BookingSearchRowV1 } from "../../_lib/dashboard-access";
import { loadDashboardRequestAccess } from "../../_lib/dashboard-server";
import { WorkspaceShell } from "../../_lib/workspace-shell";
import { dominantZone, stampStateFor } from "../../_lib/booking-display";
import { countLabel, workspaceMessage } from "../../_lib/workspace-copy";
import { ResultAlert } from "../../_lib/ui/result-alert";
import { Money } from "../../_lib/ui/money";
import { RecordCard, RecordCards, TableFrame } from "../../_lib/ui/record-cards";
import { ServiceDye } from "../../_lib/ui/service-dye";
import { When } from "../../_lib/ui/when";
import { ZoneNote } from "../../_lib/ui/zone-note";
import { BookingChangeForm } from "./booking-change-form";
import { listResultKeys, positiveResults } from "./results";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

type BookingsPageProps = {
  readonly params: Promise<{ locale: Locale }>;
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
};

// The operational statuses an operator filters by. The list deliberately
// offers the vocabulary the database uses, so a filter and a status badge can
// never describe the same booking differently.
const statuses = [
  "requested",
  "confirmed",
  "checked_in",
  "completed",
  "no_show",
  "cancelled",
] as const;

// Radix Select cannot carry an empty value. "all" is not one of the statuses
// above, so the filter below reads it as "no status filter".
const anyStatus = "all";

function single(value: string | string[] | undefined): string | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  return typeof candidate === "string" && candidate.trim() !== ""
    ? candidate.trim()
    : null;
}

async function loadBookings(
  locale: Locale,
  filters: { query: string | null; status: string | null },
): Promise<readonly BookingSearchRowV1[] | null> {
  const request = await loadDashboardRequestAccess(locale);
  if (
    request.source === null ||
    request.state.kind !== "ready" ||
    request.source.searchBookings === undefined
  ) {
    return null;
  }
  // A failed read shows the unavailable copy rather than an empty list, so
  // nobody reads "no bookings" as "nothing to do".
  return request.source
    .searchBookings({
      from: null,
      locationId: null,
      query: filters.query,
      staffId: null,
      status: filters.status,
      tenantId: request.state.context.tenantId,
      to: null,
    })
    .catch(() => null);
}

export default async function BookingsPage({
  params,
  searchParams,
}: BookingsPageProps) {
  const { locale } = await params;
  const query = await searchParams;
  const message = (key: Parameters<typeof getDashboardMessage>[1]) =>
    getDashboardMessage(locale, key);

  const requestedStatus = single(query.status);
  const filters = {
    query: single(query.q),
    status: statuses.includes(requestedStatus as (typeof statuses)[number])
      ? requestedStatus
      : null,
  };
  const bookings = await loadBookings(locale, filters);
  const result = typeof query.result === "string" ? query.result : null;
  const resultKey =
    result !== null && result in listResultKeys
      ? listResultKeys[result as keyof typeof listResultKeys]
      : null;
  // Times are shown in the zone most rows use, named once in the header.
  const viewZone = dominantZone(
    (bookings ?? []).map((booking) => booking.locationTimeZone),
    "Asia/Riyadh",
  );

  return (
    <WorkspaceShell current="bookings" labelledBy="bookings-title" locale={locale}>
      <PageHeader
        titleId="bookings-title"
        title={message("bookingsTitle")}
        description={message("bookingsSummary")}
        meta={
          bookings && bookings.length > 0 ? (
            <ZoneNote locale={locale} timeZone={viewZone} />
          ) : null
        }
      />
      {resultKey === null ? null : (
        <ResultAlert positive={positiveResults.has(result ?? "")}>
          {message(resultKey)}
        </ResultAlert>
      )}

      <form action={`/${locale}/bookings`} method="get" role="search">
        <Toolbar>
          <Field className="md:min-w-80">
            <Label htmlFor="bookings-query">{message("bookingsSearchLabel")}</Label>
            <Input
              defaultValue={filters.query ?? ""}
              id="bookings-query"
              name="q"
              type="search"
            />
          </Field>
          <Field>
            <Label htmlFor="bookings-status">
              {message("bookingsStatusFilterLabel")}
            </Label>
            <Select defaultValue={filters.status ?? anyStatus} name="status">
              <SelectTrigger id="bookings-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={anyStatus}>
                  {message("bookingsStatusAll")}
                </SelectItem>
                {statuses.map((status) => (
                  <SelectItem key={status} value={status}>
                    {workspaceStatus(locale, status)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Button type="submit" variant="secondary">
            <Search aria-hidden="true" />
            {message("bookingsSearchAction")}
          </Button>
        </Toolbar>
      </form>

      {bookings === null ? (
        <Alert tone="danger">
          <AlertDescription className="text-foreground">
            {message("bookingsUnavailable")}
          </AlertDescription>
        </Alert>
      ) : bookings.length === 0 ? (
        <EmptyState
          icon={<CalendarX aria-hidden="true" />}
          title={message("bookingsEmpty")}
        />
      ) : (
        <>
          <TableFrame>
            <Table label={message("bookingsListLabel")}>
              <TableHeader>
                <TableRow>
                  <TableHead>{workspaceMessage(locale, "reference")}</TableHead>
                  <TableHead>{message("bookingsWhenLabel")}</TableHead>
                  <TableHead>{message("requestsCustomerLabel")}</TableHead>
                  <TableHead>{message("bookingsStatusLabel")}</TableHead>
                  <TableHead>{message("detailPaymentLabel")}</TableHead>
                  <TableHead>{message("bookingsDeliveryLabel")}</TableHead>
                  <TableHead className="text-end">
                    {message("detailPriceLabel")}
                  </TableHead>
                  <TableHead className="w-14">
                    <span className="sr-only">
                      {workspaceMessage(locale, "actions")}
                    </span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bookings.map((booking) => (
                  <TableRow key={booking.bookingId}>
                    <TableCell className="min-w-44">
                      <div className="grid gap-1">
                        {/* The reference opens the detail, where the lifecycle
                            lives, so this list never becomes a second place
                            where status can change. */}
                        <Link
                          href={`/${locale}/bookings/${booking.bookingId}`}
                          aria-describedby={`booking-${booking.bookingId}`}
                          className="w-fit rounded-sm underline-offset-4 outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50"
                        >
                          <ReferenceCode className="text-primary">
                            {booking.publicReference}
                          </ReferenceCode>
                          <span className="sr-only">
                            {" "}
                            {message("bookingsOpenDetail")}
                          </span>
                        </Link>
                        <span
                          id={`booking-${booking.bookingId}`}
                          className="text-sm font-medium text-foreground"
                        >
                          <ServiceDye name={booking.serviceName} />
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {countLabel(locale, "notes", booking.noteCount)}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="min-w-40 whitespace-normal">
                      <When
                        instant={booking.startAt}
                        locale={locale}
                        timeZone={booking.locationTimeZone}
                        viewTimeZone={viewZone}
                      />
                    </TableCell>
                    <TableCell className="max-w-48 break-words whitespace-normal">
                      {booking.customerDisplayName ?? message("requestsCustomerHidden")}
                    </TableCell>
                    <TableCell>
                      <StatusStamp state={stampStateFor(booking.status)}>
                        {workspaceStatus(locale, booking.status)}
                      </StatusStamp>
                    </TableCell>
                    <TableCell className="max-w-36 whitespace-normal">
                      {workspaceStatus(locale, booking.paymentStatus)}
                    </TableCell>
                    <TableCell className="max-w-36 whitespace-normal">
                      {workspaceStatus(locale, booking.notificationStatus)}
                    </TableCell>
                    <TableCell className="text-end">
                      <Money
                        minor={booking.priceMinor}
                        currency={booking.currency}
                        locale={locale}
                      />
                    </TableCell>
                    <TableCell className="text-end">
                      <ChangeBookingDialog
                        booking={booking}
                        locale={locale}
                        describedBy={`booking-${booking.bookingId}`}
                        compact
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableFrame>
          <RecordCards label={message("bookingsListLabel")}>
            {bookings.map((booking) => (
              <RecordCard
                key={booking.bookingId}
                title={
                  <>
                    <ReferenceCode>{booking.publicReference}</ReferenceCode>
                    <span
                      id={`booking-card-${booking.bookingId}`}
                      className="font-semibold text-foreground"
                    >
                      <ServiceDye name={booking.serviceName} />
                    </span>
                  </>
                }
                aside={
                  <StatusStamp state={stampStateFor(booking.status)}>
                    {workspaceStatus(locale, booking.status)}
                  </StatusStamp>
                }
                facts={[
                  {
                    key: "when",
                    label: message("bookingsWhenLabel"),
                    value: (
                      <When
                        instant={booking.startAt}
                        locale={locale}
                        timeZone={booking.locationTimeZone}
                        viewTimeZone={viewZone}
                      />
                    ),
                  },
                  {
                    key: "customer",
                    label: message("requestsCustomerLabel"),
                    value:
                      booking.customerDisplayName ?? message("requestsCustomerHidden"),
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
                    key: "notes",
                    label: message("bookingsNotesLabel"),
                    value: countLabel(locale, "notes", booking.noteCount),
                  },
                ]}
                actions={
                  <>
                    <Button asChild variant="outline" size="sm">
                      <Link
                        href={`/${locale}/bookings/${booking.bookingId}`}
                        aria-describedby={`booking-card-${booking.bookingId}`}
                      >
                        {message("bookingsOpenDetail")}
                      </Link>
                    </Button>
                    <ChangeBookingDialog
                      booking={booking}
                      locale={locale}
                      describedBy={`booking-card-${booking.bookingId}`}
                    />
                  </>
                }
              />
            ))}
          </RecordCards>
        </>
      )}
    </WorkspaceShell>
  );
}

/**
 * Reschedule, cancel or resend in a dialog named by the booking. The table
 * uses the compact icon trigger; the phone cards show the words.
 */
function ChangeBookingDialog({
  booking,
  locale,
  describedBy,
  compact = false,
}: {
  readonly booking: BookingSearchRowV1;
  readonly locale: Locale;
  readonly describedBy: string;
  readonly compact?: boolean;
}) {
  const changeLabel = workspaceMessage(locale, "rescheduleOrCancel");
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size={compact ? "icon" : "sm"}
          aria-describedby={describedBy}
          {...(compact ? { "aria-label": changeLabel, title: changeLabel } : {})}
        >
          <CalendarClock aria-hidden="true" />
          {compact ? null : changeLabel}
        </Button>
      </DialogTrigger>
      <DialogContent closeLabel={workspaceMessage(locale, "closeDialog")}>
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-baseline gap-x-2">
            {booking.serviceName}
            <ReferenceCode>{booking.publicReference}</ReferenceCode>
          </DialogTitle>
          <DialogDescription>
            <When
              instant={booking.startAt}
              locale={locale}
              timeZone={booking.locationTimeZone}
            />{" "}
            · <bdi>{booking.locationTimeZone}</bdi>
          </DialogDescription>
        </DialogHeader>
        <BookingChangeForm
          locale={locale}
          bookingId={booking.bookingId}
          bookingRevision={booking.bookingRevision}
          locationTimeZone={booking.locationTimeZone}
        />
      </DialogContent>
    </Dialog>
  );
}
