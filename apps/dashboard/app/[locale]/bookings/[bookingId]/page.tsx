import { canDisplayBookingContact, intakeLabel } from "./booking-context-display";
import { workspaceStatus } from "../../../_lib/workspace-status";
import type { Locale } from "@wlbp/i18n";
import {
  Alert,
  AlertDescription,
  Badge,
  Button,
  EmptyState,
  Facts,
  PageHeader,
  ReferenceCode,
  Section,
  StatusStamp,
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
import { BookingNoteForm, BookingTransitionForm } from "./booking-detail-forms";
import { detailResultKeys, positiveResults } from "../results";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

type BookingDetailPageProps = {
  readonly params: Promise<{ bookingId: string; locale: Locale }>;
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
};

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
  const [context, customer] =
    booking && access.state.kind === "ready" && access.source
      ? await Promise.all([
          access.source
            .getBookingContext?.(access.state.context.tenantId, bookingId)
            .catch(() => null) ?? null,
          customerId
            ? (access.source
                .getCustomerDetail?.({
                  customerId,
                  tenantId: access.state.context.tenantId,
                })
                .catch(() => null) ?? null)
            : null,
        ])
      : [null, null];
  const message = (key: Parameters<typeof getDashboardMessage>[1]) =>
    getDashboardMessage(locale, key);
  const result = typeof query.result === "string" ? query.result : null;
  const resultKey =
    result !== null && result in detailResultKeys
      ? detailResultKeys[result as keyof typeof detailResultKeys]
      : null;
  const hidden = message("detailContactHidden");
  const allowContact = canDisplayBookingContact(context, customer);

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
                value: allowContact ? (booking.customerFullName ?? hidden) : hidden,
              },
              {
                key: "email",
                label: message("detailEmailLabel"),
                value:
                  !allowContact || booking.customerEmail === null ? (
                    hidden
                  ) : (
                    <bdi>{booking.customerEmail}</bdi>
                  ),
              },
              {
                key: "phone",
                label: message("detailPhoneLabel"),
                value:
                  !allowContact || booking.customerPhone === null ? (
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
            id="detail-intake"
            title={
              locale === "ar"
                ? "بيانات الطلب المحفوظة"
                : "Snapshotted intake and request"
            }
          >
            {!context ? (
              <p role="status">
                {locale === "ar"
                  ? "تفاصيل الطلب غير متاحة. أعد محاولة القراءة."
                  : "Request details are unavailable. Retry the read."}
              </p>
            ) : (
              <>
                <Facts
                  items={[
                    {
                      key: "approval",
                      label: locale === "ar" ? "حالة الموافقة" : "Approval status",
                      value: workspaceStatus(locale, context.request.approvalStatus),
                    },
                    {
                      key: "submitted",
                      label: locale === "ar" ? "وقت تقديم الطلب" : "Submitted",
                      value: (
                        <When
                          instant={context.request.submittedAt}
                          locale={locale}
                          timeZone={booking.locationTimeZone}
                        />
                      ),
                    },
                    ...(context.request.approvalDeadline
                      ? [
                          {
                            key: "deadline",
                            label: message("requestsDeadlineLabel"),
                            value: (
                              <When
                                instant={context.request.approvalDeadline}
                                locale={locale}
                                timeZone={booking.locationTimeZone}
                              />
                            ),
                          },
                        ]
                      : []),
                  ]}
                />
                {allowContact && context.request.publicReason ? (
                  <p className="whitespace-pre-line">{context.request.publicReason}</p>
                ) : null}
                {!allowContact || context.intake.access === "restricted" ? (
                  <p>
                    {locale === "ar"
                      ? "بيانات الاستبيان مقيّدة لهذه الصلاحية أو لحالة خصوصية العميل."
                      : "Intake is restricted by your permissions or the customer's privacy state."}
                  </p>
                ) : Object.keys(context.intake.answers).length ? (
                  <dl className="grid gap-3 rounded-lg border bg-card p-4">
                    {Object.entries(context.intake.answers).map(([key, value]) => (
                      <div key={key}>
                        <dt className="font-semibold">
                          {context.intake.access === "allowed"
                            ? intakeLabel(context.intake.schema, key, locale)
                            : key}
                        </dt>
                        <dd className="whitespace-pre-wrap break-words">
                          {typeof value === "string" ||
                          typeof value === "number" ||
                          typeof value === "boolean"
                            ? String(value)
                            : JSON.stringify(value)}
                        </dd>
                      </div>
                    ))}
                  </dl>
                ) : (
                  <p>
                    {locale === "ar"
                      ? "لا توجد إجابات محفوظة."
                      : "No snapshotted intake answers."}
                  </p>
                )}
                {context.contactAccess === "restricted" ? <p>{hidden}</p> : null}
              </>
            )}
          </Section>
          {customer?.erased ? (
            <Badge tone="neutral">{message("customersBadgeErased")}</Badge>
          ) : customer?.restricted ? (
            <Badge tone="warning">{message("customersBadgeRestricted")}</Badge>
          ) : null}
          <Section
            id="detail-customer-history"
            title={
              allowContact &&
              context?.customer.access === "allowed" &&
              context.customer.state === "active"
                ? locale === "ar"
                  ? "سجل حجوزات العميل"
                  : "Customer history"
                : locale === "ar"
                  ? "الوصول المحدود لبيانات العميل"
                  : "Limited customer access"
            }
          >
            {allowContact &&
            context?.customer.access === "allowed" &&
            context.customer.state === "active" ? (
              context.customer.history.length ? (
                <ul
                  aria-label={
                    locale === "ar" ? "سجل حجوزات العميل" : "Customer history"
                  }
                  className="divide-y rounded-lg border bg-card"
                >
                  {context.customer.history.map((item) => (
                    <li
                      key={item.bookingId}
                      className="flex flex-wrap items-center justify-between gap-3 p-4"
                    >
                      <span>
                        {item.serviceName} ·{" "}
                        <When
                          instant={item.startAt}
                          locale={locale}
                          timeZone={booking.locationTimeZone}
                        />
                      </span>
                      <StatusStamp state={stampStateFor(item.status)}>
                        {workspaceStatus(locale, item.status)}
                      </StatusStamp>
                      <Link
                        href={`/${locale}/bookings/${item.bookingId}`}
                        className={textLinkClass}
                      >
                        <ReferenceCode>{item.publicReference}</ReferenceCode>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState
                  title={
                    locale === "ar"
                      ? "لا توجد حجوزات أخرى في نطاقك."
                      : "No other bookings in your scope."
                  }
                />
              )
            ) : (
              <p>
                {locale === "ar"
                  ? "سجل العميل محدود الوصول أو مقيّد أو ممحو. تظهر فقط البيانات المصرّح بها."
                  : "Customer history has limited access, is restricted, or is erased. Only permitted data is shown."}
              </p>
            )}
          </Section>
          <Section
            id="detail-actions"
            title={message("detailLifecycleTitle")}
            description={message("detailLifecycleHint")}
          >
            <BookingTransitionForm
              key={booking.bookingId}
              locale={locale}
              bookingId={booking.bookingId}
              bookingRevision={booking.bookingRevision}
            />
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
              {booking.notes.filter(
                (note) => allowContact || note.visibility !== "sensitive",
              ).length === 0 ? (
                <EmptyState
                  icon={<StickyNote aria-hidden="true" />}
                  title={message("detailNotesEmpty")}
                />
              ) : (
                <ul className="divide-y rounded-lg border bg-card">
                  {booking.notes
                    .filter((note) => allowContact || note.visibility !== "sensitive")
                    .map((note) => (
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

              <BookingNoteForm
                key={booking.bookingId}
                locale={locale}
                bookingId={booking.bookingId}
              />
            </Section>
          </div>
        </>
      )}
    </WorkspaceShell>
  );
}
