import Link from "next/link";
import type { Locale } from "@wlbp/i18n";
import {
  Alert,
  AlertDescription,
  Button,
  EmptyState,
  Facts,
  PageHeader,
  Section,
  StatusStamp,
} from "@wlbp/ui-foundation";
import { CreditCard, ShieldCheck } from "lucide-react";
import { WorkspaceShell } from "../../_lib/workspace-shell";
import { DashboardAccessPanel } from "../../_lib/dashboard-access-panel";
import { loadDashboardRequestAccess } from "../../_lib/dashboard-server";
import { createDashboardAuthClient } from "../../_lib/auth-server";
import { workspaceStatus } from "../../_lib/workspace-status";
import { workspaceStamp } from "../communications/status-stamp";
import { OnboardingForm } from "./onboarding-form";
import { WhatsAppSection } from "./whatsapp-card";
export const dynamic = "force-dynamic";
const linkClass = "font-semibold text-primary underline-offset-4 hover:underline";
export default async function IntegrationsPage({
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
  const verifyHref = `/${locale}/auth/mfa?returnTo=${encodeURIComponent(`/${locale}/integrations`)}`;
  const enabled = (value: boolean) => (
    <StatusStamp state={value ? "confirmed" : "neutral"}>
      {m(value ? "Enabled" : "Disabled", value ? "مفعّل" : "غير مفعّل")}
    </StatusStamp>
  );
  let body;
  if (request.state.kind !== "ready")
    body = <DashboardAccessPanel locale={locale} state={request.state} />;
  else if (
    !request.state.context.grants.some(
      (g) =>
        g.capability === "integration.manage" &&
        g.scope === "tenant" &&
        !g.requiresApproval,
    )
  )
    body = (
      <Alert tone="warning">
        <AlertDescription className="text-foreground">
          {m(
            "Your current role cannot manage integrations.",
            "لا يمكن لدورك الحالي إدارة التكاملات.",
          )}
        </AlertDescription>
      </Alert>
    );
  else {
    const context = request.state.context;
    // The WhatsApp read needs only the capability; saving needs a fresh MFA.
    const whatsapp = await (async () => {
      try {
        return (await request.source?.getWhatsAppConfig?.(context.tenantId)) ?? null;
      } catch {
        return null;
      }
    })();
    const whatsappSection = (
      <WhatsAppSection locale={locale} tenantId={context.tenantId} config={whatsapp} />
    );
    const loaded = await (async () => {
      try {
        const client = await createDashboardAuthClient(false);
        const claims = await client?.auth.getClaims();

        const verified =
          !!client && !claims?.error && claims?.data?.claims.aal === "aal2";
        if (!verified) return { verified: false as const };
        if (!request.source?.getPaymentAccountStatus) throw new Error();
        const rows = await request.source.getPaymentAccountStatus(context.tenantId);
        return { verified: true as const, rows };
      } catch {
        return null;
      }
    })();
    if (loaded) {
      if (!loaded.verified)
        body = (
          <>
            <Alert tone="warning">
              <AlertDescription className="flex flex-wrap items-center gap-3 text-foreground">
                <span>
                  {m(
                    "Verify your account to read payment account status.",
                    "تحقّق من حسابك لقراءة حالة حساب الدفع.",
                  )}
                </span>
                <Button asChild size="sm">
                  <Link href={verifyHref}>
                    <ShieldCheck aria-hidden="true" />
                    {m("Verify account", "التحقق من الحساب")}
                  </Link>
                </Button>
              </AlertDescription>
            </Alert>
            {whatsappSection}
          </>
        );
      else {
        const { rows } = loaded;
        body = (
          <>
            {query.onboarding ? (
              <Alert tone="info">
                <AlertDescription className="text-foreground">
                  {m(
                    "Returned from the provider. Status below is read from platform records; the return does not prove completion.",
                    "تمت العودة من المزود. تُقرأ الحالة أدناه من سجلات المنصة، والعودة وحدها لا تُثبت اكتمال الإعداد.",
                  )}
                </AlertDescription>
              </Alert>
            ) : null}
            <Section id="integrations-payments" title={m("Payments", "المدفوعات")}>
              {rows.length ? (
                <ul className="grid divide-y rounded-lg border bg-card">
                  {rows.map((account) => (
                    <li key={account.accountReference}>
                      <article className="grid gap-4 p-5">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <h3 className="text-base font-semibold capitalize">
                            <bdi>{account.provider}</bdi>
                          </h3>
                          <StatusStamp state={workspaceStamp(account.status)}>
                            {workspaceStatus(locale, account.status)}
                          </StatusStamp>
                        </div>
                        <Facts
                          columns={2}
                          items={[
                            {
                              key: "charges",
                              label: m("Charges", "التحصيل"),
                              value: enabled(account.chargesEnabled),
                            },
                            {
                              key: "payouts",
                              label: m("Payouts", "التحويلات"),
                              value: enabled(account.payoutsEnabled),
                            },
                          ]}
                        />
                        {account.requirements.length ? (
                          <div className="grid gap-2">
                            <p className="text-sm font-semibold">
                              {m("Provider requirements", "متطلبات المزود")}
                            </p>
                            <ul className="flex flex-wrap gap-2">
                              {account.requirements.map((code) => (
                                <li key={code}>
                                  <StatusStamp state="requested">
                                    <bdi dir="ltr" className="font-latin">
                                      {code}
                                    </bdi>
                                  </StatusStamp>
                                </li>
                              ))}
                            </ul>
                          </div>
                        ) : null}
                        {account.provider === "stripe" &&
                        !["suspended", "disconnected"].includes(account.status) ? (
                          <div className="border-t pt-4">
                            <OnboardingForm
                              locale={locale}
                              attempt={crypto.randomUUID()}
                            />
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground">
                            {m(
                              "Contact the platform operator to review the account mapping or restriction.",
                              "تواصل مع مشغّل المنصة لمراجعة ربط الحساب أو القيود المفروضة عليه.",
                            )}
                          </p>
                        )}
                      </article>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState
                  icon={<CreditCard />}
                  title={m(
                    "No payment account is configured.",
                    "لا يوجد حساب دفع مهيأ.",
                  )}
                  description={m(
                    "Platform provisioning must establish the tenant mapping before hosted onboarding.",
                    "يجب أن تُنشئ المنصة ربط المنشأة قبل بدء الإعداد المستضاف.",
                  )}
                />
              )}
            </Section>
            <Section
              id="integrations-email"
              title={m("Email and calendar", "البريد والتقويم")}
            >
              <div className="grid gap-3 rounded-lg border bg-card p-5 text-sm leading-relaxed">
                <p>
                  {m(
                    "Resend delivery readiness is observed through Communications. Provider secrets and sender-domain configuration are platform owned.",
                    "تُتابَع جاهزية التسليم عبر Resend من صفحة التواصل. أسرار المزود وإعدادات نطاق المرسل تملكها المنصة.",
                  )}{" "}
                  <Link className={linkClass} href={`/${locale}/communications`}>
                    {m("Open Communications", "فتح التواصل")}
                  </Link>
                </p>
                <p>
                  {m(
                    "Calendar support is one-way .ics. Two-way Google/Microsoft sync is outside this release.",
                    "دعم التقويم أحادي الاتجاه بصيغة .ics. المزامنة الثنائية مع Google أو Microsoft خارج هذا الإصدار.",
                  )}{" "}
                  <Link className={linkClass} href={`/${locale}/brand`}>
                    {m(
                      "View domain and sender presentation status",
                      "عرض حالة النطاق والمرسل",
                    )}
                  </Link>
                </p>
              </div>
            </Section>
            {whatsappSection}
          </>
        );
      }
    } else {
      body = (
        <>
          <Alert tone="danger">
            <AlertDescription className="text-foreground">
              {m(
                "Integration status is unavailable. Retry the read.",
                "حالة التكامل غير متاحة. أعد محاولة القراءة.",
              )}
            </AlertDescription>
          </Alert>
          {whatsappSection}
        </>
      );
    }
  }
  return (
    <WorkspaceShell
      locale={locale}
      current="integrations"
      labelledBy="integrations-title"
    >
      <div className="grid gap-8">
        <PageHeader
          titleId="integrations-title"
          title={m("Integrations", "التكاملات")}
        />
        {body}
      </div>
    </WorkspaceShell>
  );
}
