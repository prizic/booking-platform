"use client";
import { featureLabel } from "./feature-label";
import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Locale } from "@wlbp/i18n";
import type { TenantConfigurationV1 } from "../../_lib/dashboard-access";
import { getDashboardMessage } from "../../_lib/copy";
import { settingsNavigation, settingsRoutes } from "./settings-fields";
import { saveStructuredSettingsAction } from "./actions";
export function SettingsForm({
  locale,
  configuration,
}: {
  locale: Locale;
  configuration: TenantConfigurationV1;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(saveStructuredSettingsAction, {});
  const [items, setItems] = useState(() =>
    settingsNavigation(configuration.navigation),
  );
  const m = (en: string, ar: string) => (locale === "ar" ? ar : en);
  useEffect(() => {
    if (state.saved) router.refresh();
  }, [state, router]);
  return (
    <form
      action={action}
      className="catalog-form"
      onReset={(event) => event.preventDefault()}
    >
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="expectedRevision" value={configuration.revision} />
      <fieldset disabled={pending}>
        <legend>
          {m("Locale and customer communication", "اللغة والتواصل مع العميل")}
        </legend>
        <label>
          {m("Default language", "اللغة الافتراضية")}
          <select
            name="defaultLocale"
            defaultValue={String(
              configuration.settings.defaultLocale ?? configuration.defaultLocale,
            )}
          >
            <option value="en">English</option>
            <option value="ar">العربية</option>
          </select>
        </label>
        <label>
          {m("Reply-to email", "بريد الرد")}
          <input
            name="replyToEmail"
            type="email"
            defaultValue={String(configuration.settings.replyToEmail ?? "")}
            maxLength={254}
          />
        </label>
      </fieldset>
      <fieldset disabled={pending}>
        <legend>
          {m("Money and booking preferences", "التفضيلات المالية والحجز")}
        </legend>
        <label>
          {m("Currency", "العملة")}
          <select
            name="currency"
            defaultValue={String(configuration.settings.currency ?? "USD")}
          >
            <option value="USD">USD</option>
            {configuration.settings.currency &&
            configuration.settings.currency !== "USD" ? (
              <option value={String(configuration.settings.currency)}>
                {String(configuration.settings.currency)}
              </option>
            ) : null}
          </select>
        </label>
        <label>
          {m("Tax rate (basis points; 100 = 1%)", "معدل الضريبة (نقاط أساس؛ ١٠٠ = ١٪)")}
          <input
            name="taxRateBps"
            type="number"
            min={0}
            max={3000}
            step={1}
            defaultValue={String(configuration.settings.taxRateBps ?? "")}
          />
        </label>
        <label>
          {m(
            "Booking horizon preference (days, 1–730)",
            "تفضيل أفق الحجز (أيام، ١–٧٣٠)",
          )}
          <input
            name="bookingHorizonDays"
            type="number"
            min={1}
            max={730}
            step={1}
            defaultValue={String(configuration.settings.bookingHorizonDays ?? "")}
          />
        </label>
        <p>
          {m(
            "Authoritative notice, slot intervals and schedule limits are managed in Availability. Saved bookings keep their snapshots.",
            "تُدار حدود الإشعار والفواصل والجدول في التوافر. تحتفظ الحجوزات المحفوظة بنسخها الأصلية.",
          )}
        </p>
      </fieldset>
      <fieldset disabled={pending}>
        <legend>{m("Customer navigation", "تنقل العميل")}</legend>
        <input name="navigationCount" type="hidden" value={items.length} />
        {items.map((row, index) => (
          <div key={row.rowKey} className="catalog-columns">
            <input name={`nav-${index}-key`} type="hidden" value={row.rowKey} />
            <label>
              {m("English label", "التسمية الإنجليزية")}
              <input
                name={`nav-${index}-en`}
                defaultValue={row.label.en}
                maxLength={160}
                required
                lang="en"
                dir="ltr"
              />
            </label>
            <label>
              {m("Arabic label", "التسمية العربية")}
              <input
                name={`nav-${index}-ar`}
                defaultValue={row.label.ar}
                maxLength={160}
                required
                lang="ar"
                dir="rtl"
              />
            </label>
            <label>
              {m("Approved route or HTTPS link", "مسار معتمد أو رابط HTTPS")}
              <input
                name={`nav-${index}-destination`}
                defaultValue={row.route ?? row.href}
                list="settings-route-options"
                required
                dir="ltr"
              />
            </label>
            <button
              type="button"
              onClick={() =>
                setItems(items.filter((item) => item.rowKey !== row.rowKey))
              }
            >
              {m("Remove link", "إزالة الرابط")}
            </button>
            <button
              type="button"
              disabled={index === 0}
              onClick={() => {
                const next = [...items];
                [next[index - 1], next[index]] = [next[index]!, next[index - 1]!];
                setItems(next);
              }}
            >
              {m("Move up", "نقل للأعلى")}
            </button>
          </div>
        ))}
        <datalist id="settings-route-options">
          {settingsRoutes.map((route) => (
            <option key={route} value={route} />
          ))}
        </datalist>
        <button
          type="button"
          disabled={items.length >= 50}
          onClick={() =>
            setItems([
              ...items,
              {
                rowKey: crypto.randomUUID(),
                route: "/book",
                label: { en: "", ar: "" },
              },
            ])
          }
        >
          {m("Add link", "إضافة رابط")}
        </button>
      </fieldset>
      <fieldset disabled={pending}>
        <legend>{m("Features granted by your plan", "الميزات المتاحة في خطتك")}</legend>
        <p>{getDashboardMessage(locale, "settingsPlanHint")}</p>
        {Object.keys(configuration.entitlements).map((key) => (
          <label key={key}>
            <input
              name={`feature-${key}`}
              type="checkbox"
              value="yes"
              defaultChecked={
                configuration.entitlements[key] === true &&
                configuration.featureConfiguration[key]?.enabled === true
              }
              disabled={configuration.entitlements[key] !== true}
            />
            <bdi>{featureLabel(locale, key)}</bdi> ·{" "}
            {m(
              configuration.entitlements[key] ? "Granted" : "Unavailable",
              configuration.entitlements[key] ? "متاح" : "غير متاح",
            )}
          </label>
        ))}
      </fieldset>
      <button disabled={pending} type="submit">
        {m(
          pending ? "Saving…" : "Save settings",
          pending ? "جارٍ الحفظ…" : "حفظ الإعدادات",
        )}
      </button>
      {state.message ? (
        <p role={state.saved ? "status" : "alert"}>
          {getDashboardMessage(locale, state.message)}
        </p>
      ) : null}
      {state.field ? (
        <p role="alert">
          {m("Review the configuration field:", "راجع حقل الإعدادات:")}{" "}
          <bdi>{state.field}</bdi>
        </p>
      ) : null}
      {state.message === "requestsResultConflict" ? (
        <button type="button" onClick={() => router.refresh()}>
          {m("Reload and review", "إعادة التحميل والمراجعة")}
        </button>
      ) : null}
    </form>
  );
}
