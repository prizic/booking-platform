import type { Locale } from "@wlbp/i18n";
import { say } from "../copy";
import { lifecycleCopy as c } from "../lifecycle-copy";
import {
  domainRetirementState,
  eligibleDomainReplacements,
  type RetirementDomain,
} from "../domain-lifecycle";
import { ActionDialog } from "./action-dialog";
import { SelectFormField, TextFormField } from "./form-fields";
import { TextLink } from "./text";
export type { RetirementDomain } from "../domain-lifecycle";
export function AddDomainDialog({
  locale,
  tenantId,
  instanceId,
}: {
  locale: Locale;
  tenantId: string;
  instanceId: string;
}) {
  return (
    <ActionDialog
      locale={locale}
      operation="addDomain"
      trigger={say(locale, c.addDomain)}
      title={say(locale, c.addDomain)}
      submit={say(locale, c.addDomain)}
      successMessage={say(locale, c.domainAdded)}
      hidden={{ tenantId, instanceId }}
      values={{ hostname: "", application: "client" }}
    >
      <TextFormField
        id="add-domain-hostname"
        name="hostname"
        label={say(locale, c.hostname)}
        required
        maxLength={253}
        autoComplete="off"
      />
      <SelectFormField
        name="application"
        label={say(locale, c.application)}
        options={[
          ["client", say(locale, c.client)],
          ["dashboard", say(locale, c.dashboard)],
        ]}
      />
    </ActionDialog>
  );
}
export function VerifyDomainDialog({
  locale,
  domainId,
}: {
  locale: Locale;
  domainId: string;
}) {
  return (
    <ActionDialog
      locale={locale}
      operation="requestDomainVerification"
      trigger={say(locale, c.verify)}
      title={say(locale, c.verify)}
      description={say(locale, c.verifyBody)}
      submit={say(locale, c.verify)}
      successMessage={say(locale, c.verifyQueued)}
      hidden={{ domainId }}
    />
  );
}
/** Only eligible same-context production replacements are offered; SQL rechecks every choice live. */
export function DomainRetirementDialog({
  locale,
  domain,
  domains,
}: {
  locale: Locale;
  domain: RetirementDomain;
  domains: readonly RetirementDomain[];
}) {
  if (domainRetirementState(domain) === "retired") return null;
  if (domain.pending_retirement_job_id)
    return (
      <TextLink href={`/${locale}/review/job/${domain.pending_retirement_job_id}`}>
        {say(locale, c.openReview)}
      </TextLink>
    );
  const eligible = eligibleDomainReplacements(domain, domains);
  return (
    <ActionDialog
      locale={locale}
      operation="requestDomainRetirement"
      trigger={say(locale, c.retire)}
      title={say(locale, c.retire)}
      description={say(locale, c.retireBody)}
      danger
      submit={say(locale, c.retire)}
      successMessage={say(locale, c.retirementRequested)}
      hidden={{ domainId: domain.id }}
      values={{ replacementDomainId: "none" }}
    >
      <SelectFormField
        name="replacementDomainId"
        label={say(locale, c.replacement)}
        options={[
          ["none", say(locale, c.noReplacement)],
          ...eligible.map((candidate) => [candidate.id, candidate.hostname] as const),
        ]}
      />
      {domain.active && !eligible.length ? (
        <p className="text-sm text-muted-foreground">
          {say(locale, c.noEligibleReplacement)}
        </p>
      ) : null}
      {domainRetirementState(domain) === "unknown" ||
      domains.some((candidate) => domainRetirementState(candidate) === "unknown") ? (
        <p className="text-sm text-muted-foreground">
          {say(locale, c.retirementUnreported)}
        </p>
      ) : null}
    </ActionDialog>
  );
}
