import type { Locale } from "@wlbp/i18n";
import {
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  FilterBar as SharedFilterBar,
  FilterField,
} from "@wlbp/ui-foundation";
import { Search, X } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { formCopy, say } from "../copy";
import { ALL_FILTER } from "../list-params";

/**
 * A plain GET form: filters live in the URL, so every view is shareable.
 * Phones stack every field full width with the actions sharing one row at the
 * end; from md up the fields sit side by side at fixed widths.
 */
export function FilterBar({
  locale,
  path,
  search,
  sort,
  children,
}: {
  locale: Locale;
  path: string;
  search?: { label: string; value: string };
  sort?: string;
  children?: ReactNode;
}) {
  return (
    <SharedFilterBar
      method="get"
      action={path}
      role="search"
      label={say(locale, formCopy.filters)}
    >
      <div className="grid w-full grid-cols-1 items-end gap-4 sm:grid-cols-2 md:flex md:flex-wrap md:gap-3">
        {sort ? <input type="hidden" name="sort" value={sort} /> : null}
        {search ? (
          <FilterField
            className="sm:col-span-2 md:w-72"
            htmlFor="filter-q"
            label={search.label}
          >
            <Input
              id="filter-q"
              type="search"
              name="q"
              defaultValue={search.value}
              maxLength={100}
            />
          </FilterField>
        ) : null}
        {children}
        <div className="flex items-center gap-2 sm:col-span-2 md:col-auto [&>*]:flex-1 md:[&>*]:flex-none">
          <Button type="submit" variant="secondary">
            <Search aria-hidden="true" />
            {say(locale, formCopy.apply)}
          </Button>
          <Button asChild variant="ghost">
            <Link href={path}>
              <X aria-hidden="true" />
              {say(locale, formCopy.clear)}
            </Link>
          </Button>
        </div>
      </div>
    </SharedFilterBar>
  );
}

/**
 * One filter. "All" submits the ALL_FILTER sentinel (Radix Select cannot hold
 * an empty value); parseListParams reads it as "no filter".
 */
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
  const id = `filter-${name}`;
  return (
    <FilterField className="md:w-52" htmlFor={id} label={label}>
      <Select name={name} defaultValue={value || ALL_FILTER}>
        <SelectTrigger id={id}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_FILTER}>{allLabel}</SelectItem>
          {options.map(([optionValue, optionLabel]) => (
            <SelectItem key={optionValue} value={optionValue}>
              {optionLabel}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </FilterField>
  );
}
