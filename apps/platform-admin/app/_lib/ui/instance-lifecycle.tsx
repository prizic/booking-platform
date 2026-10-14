import { formatNumber, type Locale } from "@wlbp/i18n";
import { Alert, Section } from "@wlbp/ui-foundation";
import { copyFor, say, stateCopy } from "../copy";
import { lifecycleCopy as c } from "../lifecycle-copy";
import { operationsCopy } from "../operations-copy";
import type { InstanceConfiguration } from "../operator-json-contracts";
import { atLeast, type OperatorContext } from "../operator-page";
import { ActionDialog } from "./action-dialog";
import { Facts } from "./facts";
import { TextFormField } from "./form-fields";
import { StatusBadge } from "./status-badge";
import { TextLink } from "./text";
export function InstanceLifecycle({
  locale,
  config,
  operator,
  tenantStatus,
  pendingJobs,
}: {
  locale: Locale;
  config: InstanceConfiguration;
  operator: OperatorContext;
  tenantStatus: string | undefined;
  pendingJobs:
    | readonly {
        id: string;
        kind: string;
        status: string;
        needsApproval: boolean;
      }[]
    | undefined;
}) {
  const admin = atLeast(operator.role, "admin");
  const closed = config.deployment_state === "closed";
  const pendingClosure = pendingJobs?.some(
    (job) =>
      job.kind === "close_instance" &&
      ["queued", "running", "failed"].includes(job.status),
  );
  return (
    <>
      <Section
        id="instance-configuration"
        title={say(locale, c.configuration)}
        actions={
          admin && !closed ? (
            <ActionDialog
              locale={locale}
              operation="updateInstanceConfiguration"
              trigger={say(locale, c.editConfiguration)}
              title={say(locale, c.editConfiguration)}
              description={say(locale, c.configurationBody)}
              submit={say(locale, c.saveConfiguration)}
              successMessage={say(locale, c.configurationSaved)}
              hidden={{
                instanceId: config.instance_id,
                expectedRevision: config.revision,
              }}
              values={{ displayName: config.display_name ?? "" }}
            >
              <TextFormField
                id="instance-display-name"
                name="displayName"
                label={say(locale, c.displayName)}
                maxLength={160}
              />
            </ActionDialog>
          ) : null
        }
      >
        <Facts
          items={[
            [
              say(locale, c.displayName),
              config.display_name ?? say(locale, stateCopy.none),
            ],
            [say(locale, c.revision), formatNumber(config.revision, locale)],
          ]}
        />
      </Section>
      <Section
        id="instance-lifecycle"
        title={say(locale, c.lifecycle)}
        actions={
          admin && !closed ? (
            <>
              {config.deployment_state !== "suspended" ? (
                <ActionDialog
                  locale={locale}
                  operation="deactivateInstance"
                  trigger={say(locale, c.deactivate)}
                  title={say(locale, c.deactivate)}
                  description={say(locale, c.deactivateBody)}
                  danger
                  submit={say(locale, c.deactivate)}
                  successMessage={say(locale, c.deactivated)}
                  hidden={{
                    instanceId: config.instance_id,
                    expectedState: config.deployment_state,
                  }}
                />
              ) : null}
              {config.deployment_state === "suspended" &&
              tenantStatus === "suspended" &&
              pendingJobs !== undefined &&
              !pendingClosure ? (
                <ActionDialog
                  locale={locale}
                  operation="requestInstanceClosure"
                  trigger={say(locale, c.closure)}
                  title={say(locale, c.closure)}
                  description={say(locale, c.closureBody)}
                  danger
                  submit={say(locale, c.closure)}
                  successMessage={say(locale, c.closureRequested)}
                  confirmText={config.instance_id}
                  hidden={{ instanceId: config.instance_id }}
                />
              ) : null}
            </>
          ) : null
        }
      >
        <StatusBadge locale={locale} status={config.deployment_state} />
        <p className="text-sm text-muted-foreground">
          {say(locale, closed ? c.closed : c.prerequisites)}
        </p>
        {!admin ? (
          <p className="text-sm text-muted-foreground">
            {say(locale, stateCopy.roleRequired)}
          </p>
        ) : null}
        {pendingJobs?.length ? (
          <ul className="grid gap-2">
            {pendingJobs.map((job) => (
              <li key={job.id}>
                <TextLink href={`/${locale}/jobs/${job.id}`}>
                  {copyFor(operationsCopy.kinds, job.kind, locale)}
                </TextLink>{" "}
                <StatusBadge locale={locale} status={job.status} />{" "}
                {job.needsApproval ? (
                  <TextLink href={`/${locale}/review/job/${job.id}`}>
                    {say(locale, c.openReview)}
                  </TextLink>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
        {pendingClosure ? (
          <Alert tone="warning">
            {say(
              locale,
              pendingJobs?.some(
                (job) => job.kind === "close_instance" && job.needsApproval,
              )
                ? c.closureRequested
                : c.awaitingExecution,
            )}
          </Alert>
        ) : null}
      </Section>
    </>
  );
}
