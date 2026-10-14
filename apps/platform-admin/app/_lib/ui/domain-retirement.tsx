import type { Locale } from "@wlbp/i18n";
import { ReferenceCode } from "@wlbp/ui-foundation";
import type { DomainRetirementMetadata } from "../domain-lifecycle";
import { Unknown } from "./states";
import { TextLink } from "./text";
import { TimeValue } from "./time";

export function DomainRetiredAt({
  locale,
  domain,
}: {
  locale: Locale;
  domain: DomainRetirementMetadata;
}) {
  return (
    <TimeValue
      locale={locale}
      value={domain.retired_at}
      empty={domain.retired_at === undefined ? "notReported" : "none"}
    />
  );
}

export function DomainReplacement({
  locale,
  domain,
  tenantId,
  domains = [],
}: {
  locale: Locale;
  domain: DomainRetirementMetadata;
  tenantId: string;
  domains?: readonly { id: string; hostname: string }[];
}) {
  const id = domain.replacement_domain_id;
  if (!id)
    return <Unknown locale={locale} kind={id === undefined ? "notReported" : "none"} />;
  const replacement = domains.find((candidate) => candidate.id === id);
  return (
    <TextLink href={`/${locale}/domains/${id}?tenant=${tenantId}`}>
      {replacement ? (
        <bdi>{replacement.hostname}</bdi>
      ) : (
        <ReferenceCode>{id}</ReferenceCode>
      )}
    </TextLink>
  );
}
