import { formatDateTime, type Locale } from "@wlbp/i18n";
import { Badge, Button, StatusMessage, Surface } from "@wlbp/ui-foundation";
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
import {
  correctCustomerAction,
  runPrivacyRequestAction,
  setCustomerFlagAction,
} from "../actions";
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
      <Surface as="section" className="requests-queue" labelledBy="customer-title">
        <h1 id="customer-title">
          {customer.fullName ?? message("customersErasedName")}
        </h1>
        {resultKey === null ? null : (
          <StatusMessage
            tone={positiveCustomerResults.has(result ?? "") ? "positive" : "warning"}
          >
            {message(resultKey)}
          </StatusMessage>
        )}
        <p>
          {customer.erased ? <Badge>{message("customersBadgeErased")}</Badge> : null}
          {customer.legalHold ? <Badge>{message("customersBadgeHold")}</Badge> : null}
          {customer.restricted ? (
            <Badge>{message("customersBadgeRestricted")}</Badge>
          ) : null}
          {customer.suppressed ? (
            <Badge>{message("customersBadgeSuppressed")}</Badge>
          ) : null}
        </p>

        <dl>
          <div>
            <dt>{message("customersEmailLabel")}</dt>
            <dd>
              <bdi>{customer.email ?? message("customersErasedValue")}</bdi>
            </dd>
          </div>
          <div>
            <dt>{message("customersPhoneLabel")}</dt>
            <dd>
              <bdi>{customer.phone ?? message("customersNoPhone")}</bdi>
            </dd>
          </div>
          <div>
            <dt>{message("customersSinceLabel")}</dt>
            <dd>{formatDateTime(customer.createdAt, locale, "UTC")}</dd>
          </div>
          {/* Counts, never contents. Reading a sensitive note happens on the
              booking it belongs to, where the capability is already enforced. */}
          <div>
            <dt>{message("customersSensitiveNotesLabel")}</dt>
            <dd>{customer.sensitiveNoteCount}</dd>
          </div>
          <div>
            <dt>{message("customersIntakeLabel")}</dt>
            <dd>{customer.intakeCount}</dd>
          </div>
          {customer.restrictionReason === null ? null : (
            <div>
              <dt>{message("customersRestrictionReasonLabel")}</dt>
              <dd>{customer.restrictionReason}</dd>
            </div>
          )}
        </dl>

        <section aria-labelledby="customer-bookings-title">
          <h2 id="customer-bookings-title">{message("customersBookingsTitle")}</h2>
          {customer.bookings.length === 0 ? (
            <p>{message("customersNoBookings")}</p>
          ) : (
            <ul>
              {customer.bookings.map((booking) => (
                <li key={booking.bookingId}>
                  <Link href={`/${locale}/bookings/${booking.bookingId}`}>
                    <bdi>{booking.publicReference}</bdi> · {booking.serviceName} ·{" "}
                    {formatDateTime(booking.startAt, locale, "UTC")} · {booking.status}
                  </Link>
                  {/* The name the booking was made under, which a later
                      correction deliberately does not rewrite. */}
                  {booking.contactName === null ||
                  booking.contactName === customer.fullName ? null : (
                    <span>
                      {" "}
                      · {message("customersBookedAs")} {booking.contactName}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="customer-consents-title">
          <h2 id="customer-consents-title">{message("customersConsentsTitle")}</h2>
          {customer.consents.length === 0 ? (
            <p>{message("customersNoConsents")}</p>
          ) : (
            <ul>
              {customer.consents.map((consent) => (
                <li key={`${consent.policyKey}-${consent.acceptedAt}`}>
                  {consent.policyKey} v{consent.policyVersion} ·{" "}
                  {formatDateTime(consent.acceptedAt, locale, "UTC")} · {consent.source}
                </li>
              ))}
            </ul>
          )}
        </section>

        {customer.erased ? null : (
          <section aria-labelledby="customer-correct-title">
            <h2 id="customer-correct-title">{message("customersCorrectTitle")}</h2>
            <form action={correctCustomerAction}>
              <input type="hidden" name="locale" value={locale} />
              <input type="hidden" name="customerId" value={customer.customerId} />
              <input type="hidden" name="expectedRevision" value={customer.revision} />
              <label htmlFor="correct-name">{message("customersNameLabel")}</label>
              <input
                defaultValue={customer.fullName ?? ""}
                id="correct-name"
                maxLength={160}
                name="fullName"
                required
                type="text"
              />
              <label htmlFor="correct-email">{message("customersEmailLabel")}</label>
              <input
                defaultValue={customer.email ?? ""}
                id="correct-email"
                maxLength={320}
                name="email"
                required
                type="email"
              />
              <label htmlFor="correct-phone">{message("customersPhoneLabel")}</label>
              <input
                defaultValue={customer.phone ?? ""}
                id="correct-phone"
                maxLength={40}
                name="phone"
                type="tel"
              />
              <label htmlFor="correct-tags">{message("customersTagsLabel")}</label>
              <input
                defaultValue={customer.tags.join(", ")}
                id="correct-tags"
                maxLength={400}
                name="tags"
                type="text"
              />
              <p>{message("customersCorrectHint")}</p>
              <Button type="submit">{message("customersCorrectAction")}</Button>
            </form>
          </section>
        )}

        <section aria-labelledby="customer-rights-title">
          <h2 id="customer-rights-title">{message("customersRightsTitle")}</h2>
          {/* Every control is offered. The database decides which one this
              record can actually accept; hiding a button is presentation, and
              presentation is never authorization. */}
          <form action={setCustomerFlagAction}>
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="customerId" value={customer.customerId} />
            <label htmlFor="flag-reason">{message("customersReasonLabel")}</label>
            <textarea id="flag-reason" maxLength={500} name="reason" rows={2} />
            <div className="requests-actions">
              <Button
                name="action"
                type="submit"
                value={customer.restricted ? "unrestrict" : "restrict"}
                variant="secondary"
              >
                {message(
                  customer.restricted
                    ? "customersUnrestrictAction"
                    : "customersRestrictAction",
                )}
              </Button>
              <Button
                name="action"
                type="submit"
                value={customer.legalHold ? "release" : "hold"}
                variant="secondary"
              >
                {message(
                  customer.legalHold
                    ? "customersReleaseHoldAction"
                    : "customersPlaceHoldAction",
                )}
              </Button>
            </div>
          </form>

          <form action={runPrivacyRequestAction}>
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="customerId" value={customer.customerId} />
            <p>{message("customersJobsHint")}</p>
            <div className="requests-actions">
              <Button name="kind" type="submit" value="export">
                {message("customersExportAction")}
              </Button>
              <Button name="kind" type="submit" value="deletion" variant="secondary">
                {message("customersDeleteAction")}
              </Button>
            </div>
          </form>
        </section>

        {exported === null || exported.artifact === null ? null : (
          <section aria-labelledby="customer-export-title">
            <h2 id="customer-export-title">{message("customersExportTitle")}</h2>
            <p>
              {message("customersExportExpires")}{" "}
              {exported.artifactExpiresAt === null
                ? message("customersErasedValue")
                : formatDateTime(exported.artifactExpiresAt, locale, "UTC")}
            </p>
            {/* ponytail: the artifact is disclosed here, inside a closed
                disclosure, because there is nowhere to put a file yet: Postgres
                PITR does not restore deleted Storage objects, so an export
                written to Storage would have no restore story. Issue #39 brings
                object backup and a restore drill; this becomes a signed
                download then. */}
            <details>
              <summary>{message("customersExportReveal")}</summary>
              <pre>{JSON.stringify(exported.artifact, null, 2)}</pre>
            </details>
          </section>
        )}

        <section aria-labelledby="customer-jobs-title">
          <h2 id="customer-jobs-title">{message("customersJobsTitle")}</h2>
          {jobs.length === 0 ? (
            <p>{message("customersNoJobs")}</p>
          ) : (
            <ul>
              {jobs.map((job) => (
                <li key={job.requestId}>
                  {job.kind} · {job.status}
                  {job.blockedReason === null ? null : ` · ${job.blockedReason}`} ·{" "}
                  {formatDateTime(job.createdAt, locale, "UTC")}
                  {job.pendingSteps > 0
                    ? ` · ${job.pendingSteps} ${message("customersPendingSteps")}`
                    : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      </Surface>
    </WorkspaceShell>
  );
}
