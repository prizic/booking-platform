import type { Locale } from "@wlbp/i18n";
import { ShieldCheck } from "lucide-react";
import { Suspense, type ReactNode } from "react";
import { say, shellCopy } from "../copy";
import { LocaleSwitch } from "../shell/locale-switch";

/** The signed-out frame for sign-in and authenticator setup. */
export function AuthFrame({
  locale,
  titleId,
  title,
  description,
  children,
}: {
  locale: Locale;
  titleId: string;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <main className="grid min-h-dvh place-items-center bg-background px-4 py-10">
      <div className="grid w-full max-w-md gap-6">
        <div className="flex flex-wrap items-center gap-3">
          <span
            aria-hidden="true"
            className="grid size-10 shrink-0 place-items-center rounded-md bg-rail text-rail-foreground"
          >
            <ShieldCheck className="size-5" />
          </span>
          <span className="grid leading-tight">
            <span className="text-base font-bold">{say(locale, shellCopy.brand)}</span>
            <span className="text-xs text-muted-foreground">
              {say(locale, shellCopy.brandDetail)}
            </span>
          </span>
          <Suspense>
            <LocaleSwitch
              locale={locale}
              label={say(locale, shellCopy.language)}
              className="ms-auto"
            />
          </Suspense>
        </div>
        <section
          aria-labelledby={titleId}
          className="grid gap-6 rounded-lg border bg-card p-6 text-card-foreground shadow-sm md:p-8"
        >
          <div className="grid gap-2">
            <h1 id={titleId} className="text-xl leading-snug font-bold text-balance">
              {title}
            </h1>
            {description ? (
              <p className="text-sm leading-relaxed text-muted-foreground">
                {description}
              </p>
            ) : null}
          </div>
          {children}
        </section>
      </div>
    </main>
  );
}
