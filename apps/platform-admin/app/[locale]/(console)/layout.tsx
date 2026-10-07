import { isLocale } from "@wlbp/i18n";
import { Badge, Button, ThemeToggle } from "@wlbp/ui-foundation";
import { THEME_COOKIE, resolveTheme } from "@wlbp/ui-foundation/preferences";
import { LogOut, ShieldCheck, UserRound } from "lucide-react";
import { cookies } from "next/headers";
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
import { runtimeEnvironment } from "../../_lib/platform-admin-server";
import { ConsoleShell } from "../../_lib/shell/console-shell";
import { LocaleSwitch } from "../../_lib/shell/locale-switch";

export const dynamic = "force-dynamic";

export default async function ConsoleLayout({
  children,
  params,
}: Readonly<{ children: ReactNode; params: Promise<{ locale: string }> }>) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();
  const locale = raw;
  // Signed-out and MFA states redirect inside loadOperatorAccess.
  const access = await loadOperatorAccess(locale);
  const signOut = (compact: boolean) => (
    <form method="post" action={`/${locale}/sign-out`}>
      <Button
        type="submit"
        variant={compact ? "ghost" : "outline"}
        size={compact ? "icon" : "default"}
        {...(compact
          ? {
              "aria-label": say(locale, shellCopy.signOut),
              title: say(locale, shellCopy.signOut),
            }
          : {})}
      >
        <LogOut aria-hidden="true" className="rtl:-scale-x-100" />
        {compact ? null : say(locale, shellCopy.signOut)}
      </Button>
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
      <main className="grid min-h-dvh place-items-center bg-background px-4 py-10">
        <section
          aria-labelledby="state-title"
          data-state={access.kind}
          className="grid w-full max-w-md gap-4 rounded-lg border bg-card p-6 text-card-foreground shadow-sm md:p-8"
        >
          <h1 id="state-title" className="text-xl leading-snug font-bold text-balance">
            {say(locale, title)}
          </h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {say(locale, body)}
          </p>
          {access.kind === "configuration-missing" ? null : (
            <div className="pt-2">{signOut(false)}</div>
          )}
        </section>
      </main>
    );
  }

  const { operator } = access;
  const theme = resolveTheme((await cookies()).get(THEME_COOKIE)?.value, "light", true);
  const environment = runtimeEnvironment();
  const role = say(locale, roleCopy[operator.role] ?? roleCopy.viewer);
  const identity = fill(locale, shellCopy.signedInAs, { email: operator.email, role });

  const brand = (
    <Link
      href={`/${locale}`}
      className="flex min-w-0 items-center gap-3 rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-ring/60"
    >
      <span
        aria-hidden="true"
        className="grid size-9 shrink-0 place-items-center rounded-md bg-primary text-primary-foreground"
      >
        <ShieldCheck className="size-5" />
      </span>
      <span className="grid min-w-0 leading-tight">
        <span className="truncate text-base font-bold text-rail-foreground">
          {say(locale, shellCopy.brand)}
        </span>
        <span className="truncate text-xs text-rail-muted">
          {say(locale, shellCopy.brandDetail)}
        </span>
      </span>
    </Link>
  );

  const mobileBrand = (
    <Link
      href={`/${locale}`}
      className="flex min-w-0 items-center gap-2 rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-ring/60"
    >
      <span
        aria-hidden="true"
        className="grid size-8 shrink-0 place-items-center rounded-md bg-primary text-primary-foreground"
      >
        <ShieldCheck className="size-4.5" />
      </span>
      <span className="truncate text-sm font-bold text-foreground">
        {say(locale, shellCopy.brand)}
      </span>
    </Link>
  );

  const topbar = (
    <>
      {/* Arabic labels get no tracking or case transform, and enough line height that joined glyphs never clip. */}
      <Badge
        tone={environment === "production" ? "danger" : "outline"}
        className="me-auto px-3 py-1 text-[0.8125rem] leading-6 tracking-normal normal-case"
        title={say(locale, shellCopy.environment)}
      >
        <span className="sr-only">{say(locale, shellCopy.environment)}: </span>
        {say(locale, shellCopy.environments[environment])}
      </Badge>
      <Link
        href={`/${locale}/account`}
        className="hidden min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 md:flex"
      >
        <UserRound aria-hidden="true" className="size-4 shrink-0" />
        <span className="truncate">
          <span className="sr-only">{identity}</span>
          <span aria-hidden="true">
            <bdi className="font-medium text-foreground">{operator.email}</bdi> · {role}
          </span>
        </span>
      </Link>
      <Button asChild variant="ghost" size="icon" className="md:hidden">
        <Link
          href={`/${locale}/account`}
          aria-label={say(locale, shellCopy.account)}
          title={say(locale, shellCopy.account)}
        >
          <UserRound aria-hidden="true" />
        </Link>
      </Button>
      <Suspense>
        <LocaleSwitch
          locale={locale}
          label={say(locale, shellCopy.language)}
          className="hidden md:inline-flex"
        />
      </Suspense>
      <ThemeToggle
        initialTheme={theme}
        labels={{
          toDark: say(locale, shellCopy.toDark),
          toLight: say(locale, shellCopy.toLight),
        }}
      />
      {signOut(true)}
    </>
  );

  return (
    <ActionFeedbackProvider locale={locale}>
      <ConsoleShell
        locale={locale}
        brand={brand}
        mobileBrand={mobileBrand}
        sheetFooter={
          <Suspense>
            <LocaleSwitch
              locale={locale}
              label={say(locale, shellCopy.language)}
              tone="rail"
            />
          </Suspense>
        }
        groups={getNavigation(locale)}
        topbar={topbar}
        labels={{
          navigation: say(locale, shellCopy.navigation),
          openMenu: say(locale, shellCopy.menu),
          closeMenu: say(locale, shellCopy.closeMenu),
          skipToContent: say(locale, shellCopy.skip),
        }}
      >
        <ActionFeedbackNotice />
        {children}
      </ConsoleShell>
    </ActionFeedbackProvider>
  );
}
