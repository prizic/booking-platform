import type { Locale } from "@wlbp/i18n";
import Link from "next/link";
import type { ReactNode } from "react";
import { say, shellCopy } from "../copy";

export function PageHeader({
  locale,
  title,
  description,
  breadcrumbs,
  actions,
}: {
  locale: Locale;
  title: string;
  description?: string;
  breadcrumbs?: readonly (readonly [label: string, href?: string])[];
  actions?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div>
        {breadcrumbs?.length ? (
          <nav className="breadcrumbs" aria-label={say(locale, shellCopy.breadcrumbs)}>
            <ol>
              {breadcrumbs.map(([label, href]) => (
                <li key={label}>
                  {href ? (
                    <Link href={href}>{label}</Link>
                  ) : (
                    <span aria-current="page">{label}</span>
                  )}
                </li>
              ))}
            </ol>
          </nav>
        ) : null}
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
      </div>
      {actions ? <div className="page-actions">{actions}</div> : null}
    </header>
  );
}
