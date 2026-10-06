import type { Locale } from "@wlbp/i18n";
import { Surface } from "@wlbp/ui-foundation";
import Link from "next/link";
import type { DashboardAccessState } from "./dashboard-access";
import { getDashboardMessage } from "./copy";
import { selectTenant } from "../[locale]/actions";
type PageState = DashboardAccessState | { readonly kind: "configuration-missing" };
export function DashboardAccessPanel({
  locale,
  state,
}: {
  locale: Locale;
  state: PageState;
}) {
  const message = (key: Parameters<typeof getDashboardMessage>[1]) =>
    getDashboardMessage(locale, key);

  if (state.kind === "configuration-missing") {
    return (
      <Surface as="section" className="access-panel" aria-labelledby="access-title">
        <h2 id="access-title">{message("configurationTitle")}</h2>
        <p>{message("configurationSummary")}</p>
      </Surface>
    );
  }
  if (state.kind === "unauthenticated") {
    return (
      <Surface as="section" className="access-panel" aria-labelledby="access-title">
        <h2 id="access-title">{message("signInTitle")}</h2>
        <p>{message("signInSummary")}</p>
        <Link href={`/${locale}/auth/sign-in`}>{message("authSignIn")}</Link>
      </Surface>
    );
  }
  if (state.kind === "denied") {
    return (
      <Surface as="section" className="access-panel" aria-labelledby="access-title">
        <h2 id="access-title">{message("deniedTitle")}</h2>
        <p>{message("deniedSummary")}</p>
      </Surface>
    );
  }
  if (state.kind === "selection-required") {
    return (
      <Surface as="section" className="access-panel" aria-labelledby="access-title">
        <h2 id="access-title">{message("selectionTitle")}</h2>
        <p>{message("selectionSummary")}</p>
        <ul className="tenant-choice-list">
          {state.choices.map((choice) => (
            <li key={choice.membershipId}>
              <form action={selectTenant}>
                <input name="locale" type="hidden" value={locale} />
                <input name="tenantId" type="hidden" value={choice.tenantId} />
                <span>
                  <strong>{choice.tenantName}</strong>
                  <small>{choice.roleKey}</small>
                </span>
                <button className="wlbp-button" type="submit">
                  {message("selectTenant")}
                </button>
              </form>
            </li>
          ))}
        </ul>
      </Surface>
    );
  }

  if (state.choices.length < 2) return null;
  return (
    <details className="access-panel">
      <summary>{message("selectionTitle")}</summary>
      <ul className="tenant-choice-list">
        {state.choices.map((choice) => (
          <li key={choice.membershipId}>
            <form action={selectTenant}>
              <input name="locale" type="hidden" value={locale} />
              <input name="tenantId" type="hidden" value={choice.tenantId} />
              <strong>{choice.tenantName}</strong>
              <button
                className="wlbp-button"
                type="submit"
                disabled={choice.tenantId === state.context.tenantId}
              >
                {message("selectTenant")}
              </button>
            </form>
          </li>
        ))}
      </ul>
    </details>
  );
}
