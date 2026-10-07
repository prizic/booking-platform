import Link from "next/link";
import { formatNumber, type Locale } from "@wlbp/i18n";
import {
  Alert,
  AlertDescription,
  Button,
  EmptyState,
  Facts,
  Field,
  Label,
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
  Toolbar,
} from "@wlbp/ui-foundation";
import { Filter, MailX } from "lucide-react";
import { WorkspaceShell } from "../../_lib/workspace-shell";
import { DashboardAccessPanel } from "../../_lib/dashboard-access-panel";
import { loadDashboardRequestAccess } from "../../_lib/dashboard-server";
import { workspaceStatus } from "../../_lib/workspace-status";
import { ChoiceSelect } from "../services/form-kit";
import { CommunicationRetry } from "./communication-retry";
import { workspaceStamp } from "./status-stamp";
import { formatWhen } from "../../_lib/booking-display";
import { RecordCard, RecordCards, TableFrame } from "../../_lib/ui/record-cards";
import { ServiceDye } from "../../_lib/ui/service-dye";
import { ZoneNote } from "../../_lib/ui/zone-note";
import { CommunicationsNav } from "../../_lib/communications-nav";
import { hasDirectCapability } from "../../_lib/notification-access";
export const dynamic = "force-dynamic";
const healthLabels = {
  queued: ["Queued", "في الانتظار"],
  sending: ["Sending", "جارٍ الإرسال"],
  delivered: ["Delivered", "تم التسليم"],
  failed: ["Failed", "فشل"],
  suppressed: ["Suppressed", "تم منع الإرسال"],
  bounced: ["Bounced", "مرتد"],
  complained: ["Complaints", "الشكاوى"],
  deadLettered: ["Stopped after retries", "توقف بعد المحاولات"],
  oldestQueuedMinutes: ["Oldest queued (minutes)", "أقدم رسالة في الانتظار (دقائق)"],
} as const;
/** Filter value meaning "every status"; Radix selects cannot submit "". */
const ALL_STATUSES = "all";
export default async function CommunicationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: Locale }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  const query = await searchParams;
  const m = (en: string, ar: string) => (locale === "ar" ? ar : en);
  const request = await loadDashboardRequestAccess(locale);
  const statuses = [
    "queued",
    "sending",
    "delivered",
    "failed",
    "suppressed",
    "bounced",
    "complained",
  ] as const;
  const status =
    typeof query.status === "string" &&
    statuses.includes(query.status as (typeof statuses)[number])
      ? query.status
      : null;
  let body;
  if (request.state.kind !== "ready")
    body = <DashboardAccessPanel locale={locale} state={request.state} />;
  else {
    const context = request.state.context;
    const loaded = await (async () => {
      try {
        if (
          !request.source?.getDeliveryHealth ||
          !request.source.listCommunicationQueue
        )
          throw new Error();
        const [health, rows] = await Promise.all([
          request.source.getDeliveryHealth({
            tenantId: context.tenantId,
          }),
          request.source.listCommunicationQueue(context.tenantId, status),
        ]);
        if (!health) throw new Error();
        return { health, rows };
      } catch {
        return null;
      }
    })();
    if (loaded) {
      const { health, rows } = loaded;
      body = (
        <>
          {query.result === "queued" ? (
            <Alert tone="positive">
              <AlertDescription className="text-foreground">
                {m(
                  "Retry queued; delivery is not yet confirmed.",
                  "أُضيفت إعادة المحاولة إلى قائمة الإرسال؛ ولم يُؤكَّد التسليم بعد.",
                )}
              </AlertDescription>
            </Alert>
          ) : null}
          <Section
            id="communications-health"
            title={m("Delivery health", "حالة التسليم")}
            description={
              <>
                {m(
                  "Counts cover your permitted bookings. Queued or sent mail is not evidence of delivery.",
                  "تشمل الأعداد الحجوزات المسموح لك بها. انتظار البريد أو إرساله لا يُثبت التسليم.",
                )}{" "}
                {m("Read at", "وقت القراءة")}:{" "}
                {formatWhen(new Date().toISOString(), locale, "UTC")}
              </>
            }
          >
            <div className="rounded-lg border bg-card p-5">
              <Facts
                columns={3}
                items={(Object.keys(healthLabels) as (keyof typeof healthLabels)[]).map(
                  (key) => ({
                    key,
                    label: healthLabels[key][locale === "ar" ? 1 : 0],
                    value: (
                      <span className="text-lg font-semibold">
                        {formatNumber(health[key], locale)}
                      </span>
                    ),
                  }),
                )}
              />
            </div>
          </Section>
          <Section id="communications-queue" title={m("Messages", "الرسائل")}>
            <form method="get">
              <Toolbar>
                <Field className="md:min-w-56">
                  <Label htmlFor="communications-status">
                    {m("Message status", "حالة الرسالة")}
                  </Label>
                  <ChoiceSelect
                    id="communications-status"
                    name="status"
                    defaultValue={status ?? ALL_STATUSES}
                    options={[
                      { value: ALL_STATUSES, label: m("All statuses", "جميع الحالات") },
                      ...statuses.map((value) => ({
                        value,
                        label: workspaceStatus(locale, value),
                      })),
                    ]}
                  />
                </Field>
                <Button type="submit" variant="outline">
                  <Filter aria-hidden="true" />
                  {m("Filter", "تصفية")}
                </Button>
              </Toolbar>
            </form>
            {rows.length ? (
              <>
                <TableFrame>
                  <Table label={m("Messages", "الرسائل")}>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{m("Booking", "الحجز")}</TableHead>
                        <TableHead>{m("Status", "الحالة")}</TableHead>
                        <TableHead>
                          {m("Created (UTC)", "تاريخ الإنشاء (UTC)")}
                        </TableHead>
                        <TableHead className="text-end">
                          {m("Recovery", "المعالجة")}
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map((row) => (
                        <TableRow key={row.id}>
                          <TableHead
                            scope="row"
                            className="h-auto py-3 text-sm font-medium whitespace-normal text-foreground"
                          >
                            <Link
                              className="grid gap-0.5 underline-offset-4 hover:underline"
                              href={`/${locale}/bookings/${row.bookingId}`}
                            >
                              <ReferenceCode className="text-primary">
                                {row.publicReference}
                              </ReferenceCode>
                              <span className="text-muted-foreground">
                                <ServiceDye name={row.serviceName} />
                              </span>
                            </Link>
                          </TableHead>
                          <TableCell>
                            <StatusStamp state={workspaceStamp(row.status)}>
                              {workspaceStatus(locale, row.status)}
                            </StatusStamp>
                          </TableCell>
                          <TableCell>
                            {formatWhen(row.createdAt, locale, "UTC")}
                          </TableCell>
                          <TableCell className="text-end">
                            {row.status === "failed" ? (
                              <CommunicationRetry
                                locale={locale}
                                bookingId={row.bookingId}
                              />
                            ) : null}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableFrame>
                <RecordCards label={m("Messages", "الرسائل")}>
                  {rows.map((row) => (
                    <RecordCard
                      key={row.id}
                      title={
                        <>
                          <Link
                            className="w-fit underline-offset-4 hover:underline"
                            href={`/${locale}/bookings/${row.bookingId}`}
                          >
                            <ReferenceCode className="text-primary">
                              {row.publicReference}
                            </ReferenceCode>
                          </Link>
                          <span className="text-sm text-muted-foreground">
                            <ServiceDye name={row.serviceName} />
                          </span>
                        </>
                      }
                      aside={
                        <StatusStamp state={workspaceStamp(row.status)}>
                          {workspaceStatus(locale, row.status)}
                        </StatusStamp>
                      }
                      facts={[
                        {
                          key: "created",
                          label: m("Created (UTC)", "تاريخ الإنشاء (UTC)"),
                          value: formatWhen(row.createdAt, locale, "UTC"),
                        },
                      ]}
                      actions={
                        row.status === "failed" ? (
                          <CommunicationRetry
                            locale={locale}
                            bookingId={row.bookingId}
                          />
                        ) : null
                      }
                    />
                  ))}
                </RecordCards>
              </>
            ) : (
              <EmptyState
                icon={<MailX />}
                title={m(
                  "No messages match this scope and filter.",
                  "لا توجد رسائل تطابق هذا النطاق والتصفية.",
                )}
              />
            )}
          </Section>
          <p className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
            <Link
              className="font-semibold text-primary underline-offset-4 hover:underline"
              href={`/${locale}/settings`}
            >
              {m("Communication preferences", "تفضيلات التواصل")}
            </Link>
            <Link
              className="font-semibold text-primary underline-offset-4 hover:underline"
              href={`/${locale}/integrations`}
            >
              {m("Provider readiness", "جاهزية المزود")}
            </Link>
          </p>
        </>
      );
    } else {
      body = (
        <Alert tone="danger">
          <AlertDescription className="text-foreground">
            {m(
              "Communication health is unavailable. Retry the read.",
              "حالة التواصل غير متاحة. أعد محاولة القراءة.",
            )}
          </AlertDescription>
        </Alert>
      );
    }
  }
  return (
    <WorkspaceShell
      locale={locale}
      current="communications"
      labelledBy="communications-title"
    >
      <div className="grid gap-8">
        <PageHeader
          titleId="communications-title"
          title={m("Communications", "التواصل")}
          meta={<ZoneNote locale={locale} timeZone="UTC" />}
        />
        <CommunicationsNav
          locale={locale}
          current="messages"
          showSettings={
            request.state.kind === "ready" &&
            hasDirectCapability(request.state.context, "policy.edit")
          }
        />
        {body}
      </div>
    </WorkspaceShell>
  );
}
