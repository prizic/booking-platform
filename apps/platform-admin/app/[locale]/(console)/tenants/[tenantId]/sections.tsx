import type { Locale } from "@wlbp/i18n";
import {
  Alert,
  Button,
  ReferenceCode,
  Section as FoundationSection,
} from "@wlbp/ui-foundation";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { actionCopy as a } from "../../../../_lib/action-copy";
import type { AuditRow } from "../../../../_lib/audit-copy";
import { copyFor, say, stateCopy, statusCopy } from "../../../../_lib/copy";
import { atLeast, type OperatorContext } from "../../../../_lib/operator-page";
import { ActionDialog } from "../../../../_lib/ui/action-dialog";
import { AuditList } from "../../../../_lib/ui/audit-list";
import { DataTable } from "../../../../_lib/ui/data-table";
import { Facts } from "../../../../_lib/ui/facts";
import {
  DateTimeFormField,
  SelectFormField,
  TextFormField,
} from "../../../../_lib/ui/form-fields";
import { OperatorForm } from "../../../../_lib/ui/operator-form";
import { EmptyState } from "../../../../_lib/ui/states";
import { StatusBadge } from "../../../../_lib/ui/status-badge";
import { MachineCode, SubText, TextLink } from "../../../../_lib/ui/text";
import { TimeValue } from "../../../../_lib/ui/time";
import { tenantsCopy as c } from "../copy";

export type TenantDetail = {
  tenant: {
    id: string;
    name: string;
    status: string;
    created_at: string;
    updated_at: string;
  };
  brands: { id: string; key: string; status: string }[];
  subscription: {
    plan_key: string;
    state: string;
    rollout_ring: string;
    started_at: string;
    ends_at: string | null;
    updated_at: string;
  } | null;
  plan: { key: string; name: string; entitlements: string[]; active: boolean } | null;
  entitlements: {
    feature_key: string;
    granted: boolean;
    source: string;
    expires_at: string | null;
    updated_at: string;
  }[];
  domains: {
    id: string;
    instance_id: string;
    hostname: string;
    application: string;
    kind: string;
    verification_status: string;
    verified_at: string | null;
    active: boolean;
  }[];
  instances: {
    id: string;
    deployment_state: string;
    brand_published: boolean;
    desired_release: string | null;
    current_release: string | null;
    reported_at: string | null;
    created_at: string;
  }[];
  provisioning_runs: {
    id: string;
    instance_id: string;
    slug: string;
    state: string;
    waiting_reason: string | null;
    last_error_code: string | null;
    updated_at: string;
  }[];
  jobs: {
    id: string;
    kind: string;
    status: string;
    attempts: number;
    last_error_code: string | null;
    needs_approval: boolean;
    created_at: string;
  }[];
  support_grants: {
    id: string;
    status: string;
    ticket_reference: string;
    scope: string;
    expires_at: string | null;
    requested_at: string;
  }[];
  audit: AuditRow[];
};

type Props = { locale: Locale; detail: TenantDetail; operator: OperatorContext };

const rings = ["canary", "early", "general"] as const;

function Section({
  id,
  title,
  actions,
  children,
}: {
  id: string;
  title: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <FoundationSection
      id={id}
      title={title}
      className="scroll-mt-20"
      {...(actions ? { actions } : {})}
    >
      {children}
    </FoundationSection>
  );
}

export function IdentitySection({ locale, detail, operator }: Props) {
  const { tenant } = detail;
  return (
    <Section
      id="identity"
      title={say(locale, c.sections.identity)}
      actions={
        atLeast(operator.role, "operator") ? (
          <ActionDialog
            locale={locale}
            operation="renameTenant"
            trigger={say(locale, c.rename)}
            title={say(locale, c.renameTitle)}
            submit={say(locale, c.rename)}
            successMessage={say(locale, c.renamed)}
            hidden={{ tenantId: tenant.id, expectedUpdatedAt: tenant.updated_at }}
            values={{ name: tenant.name }}
          >
            <TextFormField
              id="rename-name"
              name="name"
              label={say(locale, c.tenantName)}
              required
              maxLength={160}
            />
          </ActionDialog>
        ) : null
      }
    >
      <Facts
        items={[
          [say(locale, c.name), <bdi key="n">{tenant.name}</bdi>],
          [say(locale, c.id), <ReferenceCode key="i">{tenant.id}</ReferenceCode>],
          [
            say(locale, c.brands),
            <bdi key="b">{detail.brands.map((b) => b.key).join(", ")}</bdi>,
          ],
          [
            say(locale, c.created),
            <TimeValue key="c" locale={locale} value={tenant.created_at} />,
          ],
          [
            say(locale, c.updated),
            <TimeValue key="u" locale={locale} value={tenant.updated_at} />,
          ],
        ]}
      />
    </Section>
  );
}

export function LifecycleSection({ locale, detail, operator }: Props) {
  const { tenant } = detail;
  const admin = atLeast(operator.role, "admin");
  return (
    <Section
      id="lifecycle"
      title={say(locale, c.sections.lifecycle)}
      actions={
        admin ? (
          <>
            {tenant.status === "active" ? (
              <ActionDialog
                locale={locale}
                operation="setTenantStatus"
                trigger={say(locale, c.suspend)}
                danger
                title={say(locale, c.suspendTitle)}
                description={say(locale, c.suspendBody)}
                submit={say(locale, c.suspend)}
                successMessage={say(locale, c.suspended)}
                hidden={{
                  tenantId: tenant.id,
                  status: "suspended",
                  expectedStatus: tenant.status,
                }}
              />
            ) : null}
            {tenant.status === "suspended" ? (
              <>
                <ActionDialog
                  locale={locale}
                  operation="setTenantStatus"
                  trigger={say(locale, c.reactivate)}
                  title={say(locale, c.reactivateTitle)}
                  description={say(locale, c.reactivateBody)}
                  submit={say(locale, c.reactivate)}
                  successMessage={say(locale, c.reactivated)}
                  hidden={{
                    tenantId: tenant.id,
                    status: "active",
                    expectedStatus: tenant.status,
                  }}
                />
                <ActionDialog
                  locale={locale}
                  operation="requestTenantClosure"
                  trigger={say(locale, c.closure)}
                  danger
                  title={say(locale, c.closureTitle)}
                  description={say(locale, c.closureBody)}
                  submit={say(locale, c.closure)}
                  successMessage={say(locale, c.closureRequested)}
                  confirmText={tenant.name}
                  hidden={{ tenantId: tenant.id }}
                />
              </>
            ) : null}
          </>
        ) : null
      }
    >
      <Facts
        items={[
          [
            say(locale, c.status),
            <StatusBadge key="s" locale={locale} status={tenant.status} />,
          ],
        ]}
      />
      {admin && tenant.status === "active" ? (
        <p className="text-sm text-muted-foreground">
          {say(locale, c.closureNeedsSuspend)}
        </p>
      ) : null}
      {!admin ? (
        <p className="text-sm text-muted-foreground">
          {say(locale, stateCopy.roleRequired)}
        </p>
      ) : null}
    </Section>
  );
}

export function SubscriptionSection({
  locale,
  detail,
  operator,
  plans,
}: Props & { plans: { key: string; name: string; active: boolean }[] }) {
  const sub = detail.subscription;
  const admin = atLeast(operator.role, "admin");
  const ringOptions = rings.map((r) => [r, copyFor(statusCopy, r, locale)] as const);
  return (
    <Section
      id="subscription"
      title={say(locale, c.sections.subscription)}
      actions={
        admin ? (
          <>
            <ActionDialog
              locale={locale}
              operation="assignSubscription"
              trigger={say(locale, a.assignPlan.trigger)}
              title={say(locale, a.assignPlan.title)}
              description={say(locale, a.assignPlan.body)}
              submit={say(locale, a.assignPlan.submit)}
              successMessage={say(locale, a.assignPlan.done)}
              hidden={{ tenantId: detail.tenant.id }}
              values={{
                planKey: sub?.plan_key,
                ring: sub?.rollout_ring ?? "general",
              }}
            >
              <SelectFormField
                name="planKey"
                label={say(locale, a.fields.plan)}
                options={plans
                  .filter((p) => p.active)
                  .map((p) => [p.key, p.name] as const)}
              />
              <SelectFormField
                name="ring"
                label={say(locale, a.fields.ring)}
                options={ringOptions}
              />
            </ActionDialog>
            {sub ? (
              <ActionDialog
                locale={locale}
                operation="updateSubscription"
                trigger={say(locale, a.updateSubscription.trigger)}
                title={say(locale, a.updateSubscription.title)}
                description={say(locale, a.updateSubscription.body)}
                submit={say(locale, a.updateSubscription.submit)}
                successMessage={say(locale, a.updateSubscription.done)}
                hidden={{
                  tenantId: detail.tenant.id,
                  expectedUpdatedAt: sub.updated_at,
                }}
                values={{
                  state: sub.state,
                  endsAt: sub.ends_at?.slice(0, 16) ?? "",
                  ring: sub.rollout_ring,
                }}
              >
                <SelectFormField
                  name="state"
                  label={say(locale, a.fields.state)}
                  options={["trialing", "active", "past_due", "cancelled"].map(
                    (s) => [s, copyFor(statusCopy, s, locale)] as const,
                  )}
                />
                <DateTimeFormField
                  id="subscription-ends-at"
                  name="endsAt"
                  locale={locale}
                  label={say(locale, a.fields.endsAt)}
                />
                <SelectFormField
                  name="ring"
                  label={say(locale, a.fields.ring)}
                  options={ringOptions}
                />
              </ActionDialog>
            ) : null}
          </>
        ) : null
      }
    >
      <Alert tone="info">{say(locale, c.billingNote)}</Alert>
      {sub ? (
        <Facts
          items={[
            [
              say(locale, c.plan),
              <bdi key="p">{detail.plan?.name ?? sub.plan_key}</bdi>,
            ],
            [
              say(locale, c.status),
              <StatusBadge key="s" locale={locale} status={sub.state} />,
            ],
            [say(locale, c.ring), copyFor(statusCopy, sub.rollout_ring, locale)],
            [
              say(locale, c.started),
              <TimeValue key="st" locale={locale} value={sub.started_at} />,
            ],
            [
              say(locale, c.ends),
              <TimeValue key="e" locale={locale} value={sub.ends_at} empty="none" />,
            ],
          ]}
        />
      ) : (
        <EmptyState locale={locale} title={say(locale, c.noSubscription)} />
      )}
    </Section>
  );
}

export function EntitlementsSection({ locale, detail, operator }: Props) {
  const admin = atLeast(operator.role, "admin");
  return (
    <Section
      id="entitlements"
      title={say(locale, c.sections.entitlements)}
      actions={
        admin ? (
          <ActionDialog
            locale={locale}
            operation="setEntitlementOverride"
            trigger={say(locale, a.override.trigger)}
            title={say(locale, a.override.title)}
            description={say(locale, a.override.body)}
            submit={say(locale, a.override.submit)}
            successMessage={say(locale, a.override.done)}
            hidden={{ tenantId: detail.tenant.id }}
            values={{ featureKey: "", granted: "yes", expiresAt: "" }}
          >
            <TextFormField
              id="override-feature"
              name="featureKey"
              label={say(locale, a.fields.feature)}
              required
              maxLength={61}
              autoComplete="off"
            />
            <SelectFormField
              name="granted"
              label={say(locale, a.fields.grant)}
              options={[
                ["yes", say(locale, a.fields.grantYes)],
                ["no", say(locale, a.fields.grantNo)],
              ]}
            />
            <DateTimeFormField
              id="override-expires-at"
              name="expiresAt"
              locale={locale}
              label={say(locale, a.fields.expiresAt)}
            />
          </ActionDialog>
        ) : null
      }
    >
      {detail.entitlements.length === 0 ? (
        <EmptyState locale={locale} title={say(locale, c.noEntitlements)} />
      ) : (
        <DataTable
          id="entitlements-table"
          locale={locale}
          caption={say(locale, c.sections.entitlements)}
          columns={[
            { label: say(locale, c.feature) },
            { label: say(locale, c.granted) },
            { label: say(locale, c.source) },
            { label: say(locale, c.expires) },
            { label: "" },
          ]}
          rows={detail.entitlements.map((e) => ({
            key: e.feature_key,
            cells: [
              <bdi key="f">{e.feature_key}</bdi>,
              say(locale, e.granted ? stateCopy.yes : stateCopy.no),
              say(
                locale,
                c.sources[e.source as keyof typeof c.sources] ?? c.sources.plan,
              ),
              <TimeValue key="x" locale={locale} value={e.expires_at} empty="none" />,
              admin && e.source === "override" ? (
                <ActionDialog
                  key="clear"
                  locale={locale}
                  operation="clearEntitlementOverride"
                  triggerVariant="quiet"
                  trigger={say(locale, a.clearOverride.trigger)}
                  title={say(locale, a.clearOverride.title)}
                  submit={say(locale, a.clearOverride.submit)}
                  successMessage={say(locale, a.clearOverride.done)}
                  hidden={{ tenantId: detail.tenant.id, featureKey: e.feature_key }}
                />
              ) : null,
            ],
          }))}
        />
      )}
    </Section>
  );
}

export function DomainsSection({ locale, detail, operator }: Props) {
  const operatorRole = atLeast(operator.role, "operator");
  return (
    <Section
      id="domains"
      title={say(locale, c.sections.domains)}
      actions={
        operatorRole && detail.instances.length ? (
          <ActionDialog
            locale={locale}
            operation="addDomain"
            trigger={say(locale, a.addDomain.trigger)}
            title={say(locale, a.addDomain.title)}
            description={say(locale, a.addDomain.body)}
            submit={say(locale, a.addDomain.submit)}
            successMessage={say(locale, a.addDomain.done)}
            hidden={{ tenantId: detail.tenant.id }}
            values={{ hostname: "" }}
          >
            <SelectFormField
              name="instanceId"
              label={say(locale, a.fields.instance)}
              options={detail.instances.map(
                (i) =>
                  [
                    i.id,
                    `${i.id.slice(0, 8)} · ${copyFor(statusCopy, i.deployment_state, locale)}`,
                  ] as const,
              )}
            />
            <TextFormField
              id="domain-hostname"
              name="hostname"
              label={say(locale, a.fields.hostname)}
              required
              maxLength={253}
              autoComplete="off"
            />
            <SelectFormField
              name="application"
              label={say(locale, a.fields.application)}
              options={[
                ["client", say(locale, c.applications.client)],
                ["dashboard", say(locale, c.applications.dashboard)],
              ]}
            />
          </ActionDialog>
        ) : null
      }
    >
      {detail.domains.length === 0 ? (
        <EmptyState locale={locale} />
      ) : (
        <DataTable
          id="domains-table"
          locale={locale}
          caption={say(locale, c.sections.domains)}
          columns={[
            { label: say(locale, c.hostname) },
            { label: say(locale, c.application) },
            { label: say(locale, c.verification) },
            { label: say(locale, c.active) },
            { label: "" },
          ]}
          rows={detail.domains.map((d) => ({
            key: d.id,
            cells: [
              <bdi key="h">{d.hostname}</bdi>,
              say(
                locale,
                c.applications[d.application as keyof typeof c.applications] ??
                  c.applications.client,
              ),
              <>
                <StatusBadge locale={locale} status={d.verification_status} />{" "}
                <TimeValue locale={locale} value={d.verified_at} empty="none" />
              </>,
              say(locale, d.active ? stateCopy.yes : stateCopy.no),
              operatorRole && d.verification_status !== "verified" ? (
                <OperatorForm
                  key="v"
                  locale={locale}
                  operation="requestDomainVerification"
                  submit={say(locale, a.verifyDomain.submit)}
                  successMessage={say(locale, a.verifyDomain.done)}
                  compact
                  hidden={{ domainId: d.id }}
                />
              ) : null,
            ],
          }))}
        />
      )}
    </Section>
  );
}

export function InstancesSection({ locale, detail }: Omit<Props, "operator">) {
  return (
    <Section id="instances" title={say(locale, c.sections.instances)}>
      <DataTable
        id="instances-table"
        locale={locale}
        caption={say(locale, c.sections.instances)}
        columns={[
          { label: say(locale, c.instance) },
          { label: say(locale, c.state) },
          { label: say(locale, c.release) },
          { label: say(locale, c.brandPublished) },
        ]}
        rows={detail.instances.map((i) => ({
          key: i.id,
          cells: [
            <TextLink key="l" href={`/${locale}/instances/${i.id}`}>
              <bdi>{i.id}</bdi>
            </TextLink>,
            <StatusBadge key="s" locale={locale} status={i.deployment_state} />,
            <bdi key="r">
              {i.desired_release ?? "—"} →{" "}
              {i.current_release ?? say(locale, stateCopy.notReported)}
            </bdi>,
            say(locale, i.brand_published ? stateCopy.yes : stateCopy.no),
          ],
        }))}
      />
    </Section>
  );
}

export function ProvisioningSection({ locale, detail, operator }: Props) {
  return (
    <Section
      id="provisioning"
      title={say(locale, c.sections.provisioning)}
      actions={
        atLeast(operator.role, "operator") ? (
          <Button asChild variant="outline">
            <Link href={`/${locale}/provisioning/new?tenant=${detail.tenant.id}`}>
              {say(locale, c.requestProvisioning)}
            </Link>
          </Button>
        ) : null
      }
    >
      {detail.provisioning_runs.length === 0 ? (
        <EmptyState locale={locale} />
      ) : (
        <DataTable
          id="runs-table"
          locale={locale}
          caption={say(locale, c.sections.provisioning)}
          columns={[
            { label: say(locale, c.run) },
            { label: say(locale, c.state) },
            { label: say(locale, c.updated) },
          ]}
          rows={detail.provisioning_runs.map((r) => ({
            key: r.id,
            cells: [
              <TextLink key="l" href={`/${locale}/provisioning/${r.id}`}>
                <bdi>{r.slug}</bdi>
              </TextLink>,
              <>
                <StatusBadge
                  locale={locale}
                  status={r.waiting_reason ? "waiting" : r.state}
                />
                {r.last_error_code ? (
                  <SubText>
                    <MachineCode>{r.last_error_code}</MachineCode>
                  </SubText>
                ) : null}
              </>,
              <TimeValue key="t" locale={locale} value={r.updated_at} />,
            ],
          }))}
        />
      )}
    </Section>
  );
}

export function JobsSection({ locale, detail }: Omit<Props, "operator">) {
  return (
    <Section id="jobs" title={say(locale, c.sections.jobs)}>
      {detail.jobs.length === 0 ? (
        <EmptyState locale={locale} />
      ) : (
        <DataTable
          id="jobs-table"
          locale={locale}
          caption={say(locale, c.sections.jobs)}
          columns={[
            { label: say(locale, c.job) },
            { label: say(locale, c.state) },
            { label: say(locale, c.created) },
          ]}
          rows={detail.jobs.map((j) => ({
            key: j.id,
            cells: [
              <TextLink key="l" href={`/${locale}/jobs/${j.id}`}>
                <bdi>{j.kind}</bdi>
              </TextLink>,
              <StatusBadge
                key="s"
                locale={locale}
                status={j.needs_approval ? "awaiting_approval" : j.status}
              />,
              <TimeValue key="t" locale={locale} value={j.created_at} />,
            ],
          }))}
        />
      )}
    </Section>
  );
}

export function SupportSection({ locale, detail, operator }: Props) {
  return (
    <Section
      id="support"
      title={say(locale, c.sections.support)}
      actions={
        atLeast(operator.role, "operator") ? (
          <ActionDialog
            locale={locale}
            operation="requestSupport"
            trigger={say(locale, a.requestSupport.trigger)}
            title={say(locale, a.requestSupport.title)}
            description={say(locale, a.requestSupport.body)}
            submit={say(locale, a.requestSupport.submit)}
            successMessage={say(locale, a.requestSupport.done)}
            hidden={{ tenantId: detail.tenant.id }}
            values={{ ticket: "", minutes: "60" }}
          >
            <TextFormField
              id="support-ticket"
              name="ticket"
              label={say(locale, a.fields.ticket)}
              required
              maxLength={120}
            />
            <TextFormField
              id="support-minutes"
              name="minutes"
              type="number"
              label={say(locale, a.fields.minutes)}
              description={say(locale, a.fields.minutesHint)}
              min={5}
              max={480}
              required
            />
          </ActionDialog>
        ) : null
      }
    >
      {detail.support_grants.length === 0 ? (
        <EmptyState locale={locale} />
      ) : (
        <DataTable
          id="grants-table"
          locale={locale}
          caption={say(locale, c.sections.support)}
          columns={[
            { label: say(locale, c.ticket) },
            { label: say(locale, c.state) },
            { label: say(locale, c.expires) },
          ]}
          rows={detail.support_grants.map((g) => ({
            key: g.id,
            cells: [
              <TextLink key="l" href={`/${locale}/support?tenant=${detail.tenant.id}`}>
                <bdi>{g.ticket_reference}</bdi>
              </TextLink>,
              <StatusBadge key="s" locale={locale} status={g.status} />,
              <TimeValue key="t" locale={locale} value={g.expires_at} empty="none" />,
            ],
          }))}
        />
      )}
    </Section>
  );
}

export function AuditSection({ locale, detail }: Omit<Props, "operator">) {
  return (
    <Section
      id="audit"
      title={say(locale, c.sections.audit)}
      actions={
        <Button asChild variant="ghost">
          <Link href={`/${locale}/audit?tenant=${detail.tenant.id}`}>
            {say(locale, c.allAudit)}
            <ArrowRight aria-hidden="true" />
          </Link>
        </Button>
      }
    >
      {detail.audit.length ? (
        <AuditList locale={locale} rows={detail.audit} />
      ) : (
        <EmptyState locale={locale} />
      )}
    </Section>
  );
}
