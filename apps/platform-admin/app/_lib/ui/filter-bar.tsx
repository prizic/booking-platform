import type { Locale } from "@wlbp/i18n";
import Link from "next/link";
import type { ReactNode } from "react";
import { formCopy, say } from "../copy";

/** A plain GET form: filters live in the URL, so every view is shareable. */
export function FilterBar({
  locale,
  path,
  search,
  children,
}: {
  locale: Locale;
  path: string;
  search?: { label: string; value: string };
  children?: ReactNode;
}) {
  return (
    <form className="filter-bar" method="get" action={path} role="search">
      {search ? (
        <label>
          {search.label}
          <input type="search" name="q" defaultValue={search.value} maxLength={100} />
        </label>
      ) : null}
      {children}
      <button type="submit" className="wlbp-button wlbp-button--secondary">
        {say(locale, formCopy.apply)}
      </button>
      <Link href={path}>{say(locale, formCopy.clear)}</Link>
    </form>
  );
}

export function SelectFilter({
  name,
  label,
  value,
  options,
  allLabel,
}: {
  name: string;
  label: string;
  value: string | undefined;
  options: readonly (readonly [value: string, label: string])[];
  allLabel: string;
}) {
  return (
    <label>
      {label}
      <select name={name} defaultValue={value ?? ""}>
        <option value="">{allLabel}</option>
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
    </label>
  );
}
