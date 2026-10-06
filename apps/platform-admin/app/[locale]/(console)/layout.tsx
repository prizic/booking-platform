import { isLocale } from "@wlbp/i18n";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { fill, roleCopy, say, shellCopy, stateCopy } from "../../_lib/copy";
import { getNavigation } from "../../_lib/navigation";
import {
  ActionFeedbackProvider,
  ActionFeedbackNotice,
} from "../../_lib/ui/action-feedback";
import { loadOperatorAccess } from "../../_lib/operator-page";
import { LocaleSwitch } from "../../_lib/shell/locale-switch";
import { MobileMenu } from "../../_lib/shell/mobile-menu";
import { SidebarNav } from "../../_lib/shell/sidebar-nav";

export const dynamic = "force-dynamic";

export default async function ConsoleLayout({
  children,
  params,
}: Readonly<{ children: ReactNode; params: Promise<{ locale: string }> }>) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();
  const locale = raw;
  const access = await loadOperatorAccess(locale);
  const signOut = (
    <form method="post" action={`/${locale}/sign-out`}>
      <button type="submit" className="wlbp-button wlbp-button--secondary">
        {say(locale, shellCopy.signOut)}
      </button>
    </form>
  );

  if (access.kind !== "ready") {
    const [title, body] =
      access.kind === "denied"
        ? [stateCopy.deniedTitle, stateCopy.deniedBody]
        : access.kind === "configuration-missing"
          ? [stateCopy.configurationTitle, stateCopy.configurationBody]
          : [stateCopy.unavailableTitle, stateCopy.unavailableBody];
    return (
      <main className="auth-shell">
        <section
          className={`auth-card state--${access.kind}`}
          aria-labelledby="state-title"
        >
          <h1 id="state-title">{say(locale, title)}</h1>
          <p>{say(locale, body)}</p>
          {access.kind === "configuration-missing" ? null : signOut}
        </section>
      </main>
    );
  }

  const { operator } = access;
  return (
    <div className="console">
      <a className="skip-link" href="#content">
        {say(locale, shellCopy.skip)}
      </a>
      <aside className="console-sidebar">
        <Link className="console-brand" href={`/${locale}`}>
          <span>
            {say(locale, shellCopy.brand)}
            <small>{say(locale, shellCopy.brandDetail)}</small>
          </span>
        </Link>
        <MobileMenu label={say(locale, shellCopy.menu)}>
          <SidebarNav
            locale={locale}
            groups={getNavigation(locale)}
            label={say(locale, shellCopy.navigation)}
          />
        </MobileMenu>
      </aside>
      <ActionFeedbackProvider locale={locale}>
        <div className="console-main">
          <header className="console-header">
            <span className="operator">
              {fill(locale, shellCopy.signedInAs, {
                email: operator.email,
                role: say(locale, roleCopy[operator.role] ?? roleCopy.viewer),
              })}
            </span>
            <Link href={`/${locale}/account`}>{say(locale, shellCopy.account)}</Link>
            <Suspense>
              <LocaleSwitch
                locale={locale}
                label={say(locale, shellCopy.language)}
                names={{
                  en: say(locale, shellCopy.english),
                  ar: say(locale, shellCopy.arabic),
                }}
              />
            </Suspense>
            {signOut}
          </header>
          <main id="content" className="console-content" tabIndex={-1}>
            <ActionFeedbackNotice />
            {children}
          </main>
        </div>
      </ActionFeedbackProvider>
    </div>
  );
}
