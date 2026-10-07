import Link from "next/link";

/**
 * One counted area as a compact labelled row: the area name and its count on
 * one line, its breakdown beneath as linked label/count pairs. Deliberately
 * not a big-number tile.
 */
export function Metric({
  href,
  title,
  value,
  details,
  headingLevel = 2,
}: {
  href: string;
  title: string;
  value: string;
  details?: readonly (readonly [label: string, value: string, href?: string])[];
  headingLevel?: 2 | 3;
}) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  return (
    <section aria-label={title} className="grid content-start gap-2 py-4">
      <div className="flex items-baseline justify-between gap-4">
        <Heading className="text-sm font-semibold">
          <Link
            href={href}
            className="rounded-sm underline-offset-4 outline-none hover:text-primary hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            {title}
          </Link>
        </Heading>
        <span className="text-base font-bold [font-variant-numeric:tabular-nums]">
          {value}
        </span>
      </div>
      {details?.length ? (
        <ul className="grid gap-1 text-sm">
          {details.map(([label, detailValue, detailHref]) => (
            <li key={label} className="flex items-baseline justify-between gap-4">
              {detailHref ? (
                <Link
                  href={detailHref}
                  className="rounded-sm text-muted-foreground underline-offset-4 outline-none hover:text-foreground hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50"
                >
                  {label}
                </Link>
              ) : (
                <span className="text-muted-foreground">{label}</span>
              )}
              <span className="font-medium [font-variant-numeric:tabular-nums]">
                {detailValue}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
