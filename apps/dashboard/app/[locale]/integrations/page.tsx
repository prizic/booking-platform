import Link from "next/link";
import type { Locale } from "@wlbp/i18n";
import { WorkspaceShell } from "../../_lib/workspace-shell";
import { DashboardAccessPanel } from "../../_lib/dashboard-access-panel";
import { loadDashboardRequestAccess } from "../../_lib/dashboard-server";
import { createDashboardAuthClient } from "../../_lib/auth-server";
import { workspaceStatus } from "../../_lib/workspace-status";
import { OnboardingForm } from "./onboarding-form";
export const dynamic = "force-dynamic";
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
      <p>
        {m(
          "Your current role cannot manage integrations.",
          "لا يمكن لدورك الحالي إدارة التكاملات.",
        )}
      </p>
    );
  else {
    const context = request.state.context;
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
          <p>
            {m(
              "Verify your account to read payment account status.",
              "تحقق من حسابك لقراءة حالة حساب الدفع.",
            )}{" "}
            <Link
              href={`/${locale}/auth/mfa?returnTo=${encodeURIComponent(`/${locale}/integrations`)}`}
            >
              {m("Verify account", "التحقق من الحساب")}
            </Link>
          </p>
        );
      else {
        const { rows } = loaded;
        body = (
          <>
            {query.onboarding ? (
              <p role="status">
                {m(
                  "Returned from the provider. Status below is read from platform records; the return does not prove completion.",
                  "تمت العودة من المزود. تُقرأ الحالة أدناه من سجلات المنصة؛ لا تُثبت العودة اكتمال الإعداد.",
                )}
              </p>
            ) : null}
            <section>
              <h2>{m("Payments", "المدفوعات")}</h2>
              {rows.length ? (
                rows.map((account) => (
                  <article key={account.accountReference} className="workspace-section">
                    <h3>
                      {account.provider} · {workspaceStatus(locale, account.status)}
                    </h3>
                    <p>
                      {m("Charges", "التحصيل")}:{" "}
                      {m(
                        account.chargesEnabled ? "Enabled" : "Disabled",
                        account.chargesEnabled ? "مفعّل" : "غير مفعّل",
                      )}{" "}
                      · {m("Payouts", "التحويلات")}:{" "}
                      {m(
                        account.payoutsEnabled ? "Enabled" : "Disabled",
                        account.payoutsEnabled ? "مفعّل" : "غير مفعّل",
                      )}
                    </p>
                    {account.requirements.length ? (
                      <>
                        <p>{m("Provider requirements", "متطلبات المزود")}</p>
                        <ul>
                          {account.requirements.map((code) => (
                            <li key={code}>
                              <bdi>{code}</bdi>
                            </li>
                          ))}
                        </ul>
                      </>
                    ) : null}
                    {account.provider === "stripe" &&
                    !["suspended", "disconnected"].includes(account.status) ? (
                      <OnboardingForm locale={locale} attempt={crypto.randomUUID()} />
                    ) : (
                      <p>
                        {m(
                          "Contact the platform operator to review the account mapping or restriction.",
                          "تواصل مع مشغّل المنصة لمراجعة ربط الحساب أو القيود.",
                        )}
                      </p>
                    )}
                  </article>
                ))
              ) : (
                <p>
                  {m(
                    "No payment account is configured. Platform provisioning must establish the tenant mapping before hosted onboarding.",
                    "لا يوجد حساب دفع مهيأ. يجب أن تنشئ المنصة ربط المؤسسة قبل الإعداد المستضاف.",
                  )}
                </p>
              )}
            </section>
            <section>
              <h2>{m("Email and calendar", "البريد والتقويم")}</h2>
              <p>
                {m(
                  "Resend delivery readiness is observed through Communications. Provider secrets and sender-domain configuration are platform owned.",
                  "تُراقب جاهزية تسليم Resend عبر التواصل. تملك المنصة أسرار المزود وإعدادات نطاق المرسل.",
                )}
              </p>
              <Link href={`/${locale}/communications`}>
                {m("Open Communications", "فتح التواصل")}
              </Link>
              <p>
                {m(
                  "Calendar support is one-way .ics. Two-way Google/Microsoft sync is outside this release.",
                  "دعم التقويم أحادي الاتجاه بصيغة .ics. المزامنة الثنائية مع Google أو Microsoft خارج هذا الإصدار.",
                )}
              </p>
              <Link href={`/${locale}/brand`}>
                {m(
                  "View domain and sender presentation status",
                  "عرض حالة النطاق والمرسل",
                )}
              </Link>
            </section>
          </>
        );
      }
    } else {
      body = (
        <p role="alert">
          {m(
            "Integration status is unavailable. Retry the read.",
            "حالة التكامل غير متاحة. أعد محاولة القراءة.",
          )}
        </p>
      );
    }
  }
  return (
    <WorkspaceShell
      locale={locale}
      current="integrations"
      labelledBy="integrations-title"
    >
      <header className="dashboard-intro">
        <h1 id="integrations-title">{m("Integrations", "التكاملات")}</h1>
      </header>
      {body}
    </WorkspaceShell>
  );
}
