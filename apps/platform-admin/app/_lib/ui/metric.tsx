import Link from "next/link";

export function Metric({
  href,
  title,
  value,
  details,
}: {
  href: string;
  title: string;
  value: string;
  details?: readonly (readonly [label: string, value: string, href?: string])[];
}) {
  return (
    <section className="metric" aria-label={title}>
      <h2>
        <Link href={href}>{title}</Link>
      </h2>
      <strong>{value}</strong>
      {details?.length ? (
        <ul>
          {details.map(([label, detailValue, detailHref]) => (
            <li key={label}>
              {detailHref ? (
                <Link href={detailHref}>
                  {label}: {detailValue}
                </Link>
              ) : (
                <>
                  {label}: {detailValue}
                </>
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
