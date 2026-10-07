import { workspaceStatus } from "../../../_lib/workspace-status";
import type { Locale } from "@wlbp/i18n";
import {
  Badge,
  EmptyState,
  Facts,
  PageHeader,
  ReferenceCode,
  Section,
  StatusStamp,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@wlbp/ui-foundation";
import { ArrowLeft, CalendarX } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getDashboardMessage } from "../../../_lib/copy";
import type {
  CustomerDetailV1,
  PrivacyRequestDetailV1,
  PrivacyRequestRowV1,
} from "../../../_lib/dashboard-access";
import { loadDashboardRequestAccess } from "../../../_lib/dashboard-server";
import { WorkspaceShell } from "../../../_lib/workspace-shell";
import { formatCount, formatWhen, stampStateFor } from "../../../_lib/booking-display";
import { RecordCard, RecordCards, TableFrame } from "../../../_lib/ui/record-cards";
import { ServiceDye } from "../../../_lib/ui/service-dye";
import { ZoneNote } from "../../../_lib/ui/zone-note";
import { countLabel, workspaceMessage } from "../../../_lib/workspace-copy";
import { ResultAlert } from "../../../_lib/ui/result-alert";
import { textLinkClass } from "../../../_lib/ui/text-link";
import { CustomerCorrectionForm, CustomerRightsForms } from "./customer-forms";
import { customerResultKeys, positiveCustomerResults } from "../results";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

type CustomerDetailPageProps = {
  readonly params: Promise<{ customerId: string; locale: Locale }>;
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
};

async function load(
  locale: Locale,
  customerId: string,
): Promise<{
  customer: CustomerDetailV1;
  export: PrivacyRequestDetailV1 | null;
  jobs: readonly PrivacyRequestRowV1[];
} | null> {
  const request = await loadDashboardRequestAccess(locale);
  if (
    request.source === null ||
    request.state.kind !== "ready" ||
    request.source.getCustomerDetail === undefined
  ) {
    return null;
  }
  const tenantId = request.state.context.tenantId;
  const customer = await request.source
    .getCustomerDetail({ customerId, tenantId })
    .catch(() => null);
  if (customer === null) return null;
  // The audit trail is a separate capability, so a member who may read the
  // customer but not the trail gets the record with an empty history rather
  // than an error.
  const jobs =
    (await request.source
      .listPrivacyRequests?.({ customerId, tenantId })
      .catch(() => [])) ?? [];
  // The artifact never travels in a list: it is excluded from the table grant
  // and comes back only from the function that re-checks capability and
  // step-up. So the newest finished export is re-read on its own.
  const newestExport = jobs.find(
    (job) => job.kind === "export" && job.status === "completed",
  );
  const exported =
    newestExport === undefined
      ? null
      : ((await request.source
          .getPrivacyRequest?.({ requestId: newestExport.requestId, tenantId })
          .catch(() => null)) ?? null);
  return { customer, export: exported, jobs };
}

export default async function CustomerDetailPage({
  params,
  searchParams,
}: CustomerDetailPageProps) {
  const { customerId, locale } = await params;
  const query = await searchParams;
  const message = (key: Parameters<typeof getDashboardMessage>[1]) =>
    getDashboardMessage(locale, key);

  const loaded = await load(locale, customerId);
  if (loaded === null) notFound();
  const { customer, export: exported, jobs } = loaded;

  const result = typeof query.result === "string" ? query.result : null;
  const resultKey =
    result !== null && result in customerResultKeys
      ? customerResultKeys[result as keyof typeof customerResultKeys]
      : null;

  return (
    <WorkspaceShell current="customers" labelledBy="customer-title" locale={locale}>
      <div className="grid gap-4">
        <Link
          className={`${textLinkClass} inline-flex w-fit items-center gap-1.5 text-sm`}
          href={`/${locale}/customers`}
        >
          <ArrowLeft aria-hidden="true" className="size-4 rtl:-scale-x-100" />
          {message("customersListLabel")}
        </Link>
        <PageHeader
          titleId="customer-title"
          title={customer.fullName ?? message("customersErasedName")}
          meta={
            customer.erased ||
            customer.legalHold ||
            customer.restricted ||
            customer.suppressed ? (
              <>
                {customer.erased ? (
                  <Badge tone="neutral">{message("customersBadgeErased")}</Badge>
                ) : null}
                {customer.legalHold ? (
                  <Badge tone="warning">{message("customersBadgeHold")}</Badge>
                ) : null}
                {customer.restricted ? (
                  <Badge tone="danger">{message("customersBadgeRestricted")}</Badge>
                ) : null}
                {customer.suppressed ? (
                  <Badge tone="neutral">{message("customersBadgeSuppressed")}</Badge>
                ) : null}
                <ZoneNote locale={locale} timeZone="UTC" />
              </>
            ) : (
              <ZoneNote locale={locale} timeZone="UTC" />
            )
          }
        />
      </div>
      {resultKey === null ? null : (
        <ResultAlert positive={positiveCustomerResults.has(result ?? "")}>
          {message(resultKey)}
        </ResultAlert>
      )}

      <Facts
        columns={3}
        className="rounded-lg border bg-card p-5"
        items={[
          {
            key: "email",
            label: message("customersEmailLabel"),
            value: <bdi>{customer.email ?? message("customersErasedValue")}</bdi>,
          },
          {
            key: "phone",
            label: message("customersPhoneLabel"),
            value: <bdi>{customer.phone ?? message("customersNoPhone")}</bdi>,
          },
          {
            key: "since",
            label: message("customersSinceLabel"),
            value: formatWhen(customer.createdAt, locale, "UTC"),
          },
          // Counts, never contents. Reading a sensitive note happens on the
          // booking it belongs to, where the capability is already enforced.
          {
            key: "sensitive",
            label: message("customersSensitiveNotesLabel"),
            value: formatCount(customer.sensitiveNoteCount, locale),
          },
          {
            key: "intake",
            label: message("customersIntakeLabel"),
            value: formatCount(customer.intakeCount, locale),
          },
          ...(customer.restrictionReason === null
            ? []
            : [
                {
                  key: "restriction",
                  label: message("customersRestrictionReasonLabel"),
                  value: customer.restrictionReason,
                },
              ]),
        ]}
      />

      <Section id="customer-bookings" title={message("customersBookingsTitle")}>
        {customer.bookings.length === 0 ? (
          <EmptyState
            icon={<CalendarX aria-hidden="true" />}
            title={message("customersNoBookings")}
          />
        ) : (
          <>
            <TableFrame>
              <Table label={message("customersBookingsTitle")}>
                <TableHeader>
                  <TableRow>
                    <TableHead>{workspaceMessage(locale, "reference")}</TableHead>
                    <TableHead>{workspaceMessage(locale, "service")}</TableHead>
                    <TableHead>{message("bookingsWhenLabel")}</TableHead>
                    <TableHead>{message("bookingsStatusLabel")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {customer.bookings.map((booking) => (
                    <TableRow key={booking.bookingId}>
                      <TableCell>
                        <Link
                          className={textLinkClass}
                          href={`/${locale}/bookings/${booking.bookingId}`}
                        >
                          <ReferenceCode className="text-primary">
                            {booking.publicReference}
                          </ReferenceCode>
                        </Link>
                      </TableCell>
                      <TableCell>
                        <ServiceDye name={booking.serviceName} />
                        {/* The name the booking was made under, which a later
                        correction deliberately does not rewrite. */}
                        {booking.contactName === null ||
                        booking.contactName === customer.fullName ? null : (
                          <span className="block text-xs text-muted-foreground">
                            {message("customersBookedAs")} {booking.contactName}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="min-w-44">
                        {formatWhen(booking.startAt, locale, "UTC")}
                      </TableCell>
                      <TableCell>
                        <StatusStamp state={stampStateFor(booking.status)}>
                          {workspaceStatus(locale, booking.status)}
                        </StatusStamp>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableFrame>
            <RecordCards label={message("customersBookingsTitle")}>
              {customer.bookings.map((booking) => (
                <RecordCard
                  key={booking.bookingId}
                  title={
                    <>
                      <Link
                        className={textLinkClass}
                        href={`/${locale}/bookings/${booking.bookingId}`}
                      >
                        <ReferenceCode className="text-primary">
                          {booking.publicReference}
                        </ReferenceCode>
                      </Link>
                      <span className="font-semibold">
                        <ServiceDye name={booking.serviceName} />
                      </span>
                      {booking.contactName === null ||
                      booking.contactName === customer.fullName ? null : (
                        <span className="text-xs text-muted-foreground">
                          {message("customersBookedAs")} {booking.contactName}
                        </span>
                      )}
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
                      value: formatWhen(booking.startAt, locale, "UTC"),
                    },
                  ]}
                />
              ))}
            </RecordCards>
          </>
        )}
      </Section>

      <Section id="customer-consents" title={message("customersConsentsTitle")}>
        {customer.consents.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {message("customersNoConsents")}
          </p>
        ) : (
          <ul className="divide-y rounded-lg border bg-card">
            {customer.consents.map((consent) => (
              <li
                key={`${consent.policyKey}-${consent.acceptedAt}`}
                className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-sm"
              >
                <bdi dir="ltr" className="font-latin font-semibold">
                  {consent.policyKey} v{consent.policyVersion}
                </bdi>
                <span className="text-muted-foreground">
                  {formatWhen(consent.acceptedAt, locale, "UTC")}
                </span>
                <bdi dir="ltr" className="font-latin text-muted-foreground">
                  {consent.source}
                </bdi>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <div className="grid items-start gap-8 lg:grid-cols-2">
        {customer.erased ? null : (
          <Section id="customer-correct" title={message("customersCorrectTitle")}>
            <CustomerCorrectionForm
              locale={locale}
              customerId={customer.customerId}
              revision={customer.revision}
              fullName={customer.fullName ?? ""}
              email={customer.email ?? ""}
              phone={customer.phone ?? ""}
              tags={customer.tags.join(", ")}
            />
          </Section>
        )}

        <Section id="customer-rights" title={message("customersRightsTitle")}>
          {/* Every control is offered. The database decides which one this
              record can actually accept; hiding a button is presentation, and
              presentation is never authorization. */}
          <CustomerRightsForms
            key={customer.customerId}
            locale={locale}
            customerId={customer.customerId}
            restricted={customer.restricted}
            legalHold={customer.legalHold}
          />
        </Section>
      </div>

      {exported === null || exported.artifact === null ? null : (
        <Section
          id="customer-export"
          title={message("customersExportTitle")}
          description={`${message("customersExportExpires")} ${
            exported.artifactExpiresAt === null
              ? message("customersErasedValue")
              : `${formatWhen(exported.artifactExpiresAt, locale, "UTC")} (UTC)`
          }`}
        >
          {/* ponytail: the artifact is disclosed here, inside a closed
              disclosure, because there is nowhere to put a file yet: Postgres
              PITR does not restore deleted Storage objects, so an export
              written to Storage would have no restore story. Issue #39 brings
              object backup and a restore drill; this becomes a signed
              download then. */}
          <details className="group rounded-lg border bg-card">
            <summary className="flex min-h-11 cursor-pointer items-center px-4 text-sm font-semibold text-primary outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
              {message("customersExportReveal")}
            </summary>
            <pre
              dir="ltr"
              className="max-h-96 overflow-auto border-t bg-neutral-1 p-4 text-start font-latin text-xs leading-relaxed"
            >
              {JSON.stringify(exported.artifact, null, 2)}
            </pre>
          </details>
        </Section>
      )}

      <Section id="customer-jobs" title={message("customersJobsTitle")}>
        {jobs.length === 0 ? (
          <p className="text-sm text-muted-foreground">{message("customersNoJobs")}</p>
        ) : (
          <>
            <TableFrame>
              <Table label={message("customersJobsTitle")}>
                <TableHeader>
                  <TableRow>
                    <TableHead>{workspaceMessage(locale, "jobKind")}</TableHead>
                    <TableHead>{message("bookingsStatusLabel")}</TableHead>
                    <TableHead>{workspaceMessage(locale, "jobCreated")}</TableHead>
                    <TableHead>{workspaceMessage(locale, "jobProgress")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {jobs.map((job) => (
                    <TableRow key={job.requestId}>
                      <TableCell>
                        {job.kind === "export"
                          ? workspaceMessage(locale, "jobExport")
                          : job.kind === "deletion"
                            ? workspaceMessage(locale, "jobDeletion")
                            : job.kind}
                      </TableCell>
                      <TableCell>
                        <StatusStamp state={stampStateFor(job.status)}>
                          {workspaceStatus(locale, job.status)}
                        </StatusStamp>
                        {job.blockedReason === null ? null : (
                          <bdi
                            dir="ltr"
                            className="mt-1 block font-latin text-xs text-muted-foreground"
                          >
                            {job.blockedReason}
                          </bdi>
                        )}
                      </TableCell>
                      <TableCell className="min-w-44">
                        {formatWhen(job.createdAt, locale, "UTC")}
                      </TableCell>
                      <TableCell>
                        {job.pendingSteps > 0
                          ? countLabel(locale, "openSteps", job.pendingSteps)
                          : null}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableFrame>
            <RecordCards label={message("customersJobsTitle")}>
              {jobs.map((job) => (
                <RecordCard
                  key={job.requestId}
                  title={
                    <span className="font-semibold">
                      {job.kind === "export"
                        ? workspaceMessage(locale, "jobExport")
                        : job.kind === "deletion"
                          ? workspaceMessage(locale, "jobDeletion")
                          : job.kind}
                    </span>
                  }
                  aside={
                    <StatusStamp state={stampStateFor(job.status)}>
                      {workspaceStatus(locale, job.status)}
                    </StatusStamp>
                  }
                  facts={[
                    {
                      key: "created",
                      label: workspaceMessage(locale, "jobCreated"),
                      value: formatWhen(job.createdAt, locale, "UTC"),
                    },
                    {
                      key: "progress",
                      label: workspaceMessage(locale, "jobProgress"),
                      value:
                        job.pendingSteps > 0
                          ? countLabel(locale, "openSteps", job.pendingSteps)
                          : "—",
                    },
                    ...(job.blockedReason === null
                      ? []
                      : [
                          {
                            key: "blocked",
                            label: message("bookingsStatusLabel"),
                            value: (
                              <bdi dir="ltr" className="font-latin text-xs break-all">
                                {job.blockedReason}
                              </bdi>
                            ),
                          },
                        ]),
                  ]}
                />
              ))}
            </RecordCards>
          </>
        )}
      </Section>
    </WorkspaceShell>
  );
}
