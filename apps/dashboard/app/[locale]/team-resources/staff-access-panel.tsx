"use client";
import type { ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, Send } from "lucide-react";
import type { StaffAccessWorkspaceV1 } from "@wlbp/api-contracts";
import type { Locale } from "@wlbp/i18n";
import { formatWhen } from "../../_lib/booking-display";
import {
  Button,
  EmptyState,
  FieldGroup,
  Form,
  Section,
  StatusStamp,
  applyActionErrors,
  useActionMutation,
  useZodForm,
  type StampState,
} from "@wlbp/ui-foundation";
import { dashboardFormMessages } from "../../_lib/form-messages";
import { ConfirmAction } from "../services/confirm-submit";
import { FormActions } from "../services/form-kit";
import {
  CheckboxGroupField,
  SelectField,
  TextField,
  type FormControlOf,
} from "../services/form-fields";
import { newAttemptId, useAuthoritativeDefaults } from "../services/form-hooks";
import { MutationFeedback } from "../services/mutation-feedback";
import { changeStaffAccessAction } from "./staff-access-actions";
import { staffAccessSchema, type StaffAccessInput } from "./staff-access-schema";
import {
  staffAccessMessage,
  staffRoleName,
  type StaffAccessMessage,
} from "./staff-access";

type AccessState = StaffAccessWorkspaceV1["members"][number]["status"];
type InvitationState = StaffAccessWorkspaceV1["invitations"][number]["status"];
type DeliveryState = StaffAccessWorkspaceV1["invitations"][number]["deliveryStatus"];

function stamp(status: AccessState | InvitationState | DeliveryState): StampState {
  switch (status) {
    case "active":
    case "accepted":
    case "sent":
      return "confirmed";
    case "pending":
    case "queued":
    case "sending":
      return "pending";
    case "revoked":
    case "superseded":
      return "cancelled";
    case "failed":
      return "failed";
    case "suspended":
    case "expired":
      return "requested";
    default:
      return "neutral";
  }
}

function Disclosure({
  summary,
  tone = "default",
  children,
}: {
  summary: ReactNode;
  tone?: "default" | "danger";
  children: ReactNode;
}) {
  return (
    <details className="group border-t">
      <summary
        className={
          tone === "danger"
            ? "flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-md px-1 py-2 text-sm font-semibold text-destructive outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden"
            : "flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-md px-1 py-2 text-sm font-semibold text-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden"
        }
      >
        {summary}
        <ChevronDown
          aria-hidden="true"
          className="size-4 text-muted-foreground transition-transform group-open:rotate-180"
        />
      </summary>
      <div className="pb-4">{children}</div>
    </details>
  );
}

const errorKeys = [
  "invalid",
  "not_authorized",
  "unavailable",
  "revision_conflict",
  "last_administrator_required",
  "step_up_required",
  "idempotency_conflict",
  "invitation_not_pending",
  "member_already_active",
] as const satisfies readonly StaffAccessMessage[];

function accessErrorMessages(locale: Locale): Readonly<Record<string, string>> {
  return {
    ...dashboardFormMessages(locale),
    ...Object.fromEntries(
      errorKeys.map((key) => [key, staffAccessMessage(locale, key)]),
    ),
  };
}

type AccessControl = FormControlOf<StaffAccessInput, unknown>;

function AccessForm({
  locale,
  operation,
  targetId,
  revision,
  requestId,
  roleId = "",
  locationIds = [],
  children,
}: {
  locale: Locale;
  operation: StaffAccessInput["operation"];
  targetId?: string;
  revision?: number;
  requestId: string;
  roleId?: string;
  locationIds?: readonly string[];
  children: (helpers: {
    control: AccessControl;
    pending: boolean;
    /** Submits with the explicit confirmation; call only from a dialog's confirm button. */
    confirm: () => void;
  }) => ReactNode;
}) {
  const router = useRouter();
  const messages = accessErrorMessages(locale);
  const defaults: StaffAccessInput = {
    locale,
    operation,
    requestId,
    targetId: targetId ?? "",
    expectedRevision: revision === undefined ? "" : String(revision),
    roleId,
    locationIds: [...locationIds],
    email: "",
  };
  const form = useZodForm(staffAccessSchema, { defaultValues: defaults });
  useAuthoritativeDefaults(form, defaults);
  const mutation = useActionMutation(changeStaffAccessAction, {
    onFailure: (result) => applyActionErrors(form, result),
    onSuccess: () => {
      form.reset();
      form.setValue("requestId", newAttemptId());
    },
  });
  const message = (key: StaffAccessMessage) => staffAccessMessage(locale, key);
  return (
    <Form form={form} locale={locale} messages={messages}>
      <form
        noValidate
        className="grid gap-4"
        data-access-operation={operation}
        {...(targetId ? { "data-access-target": targetId } : {})}
        onSubmit={form.handleSubmit(() => mutation.mutate(form.getValues()))}
      >
        <MutationFeedback
          locale={locale}
          messages={messages}
          result={mutation.data}
          transportFailed={mutation.isError}
          success={message("saved")}
          reload={{
            codes: ["revision_conflict"],
            label: message("reload"),
            onReload: () => router.refresh(),
          }}
          extra={(code) =>
            code === "step_up_required" ? (
              <Link
                className="font-semibold text-primary underline-offset-4 hover:underline"
                href={`/${locale}/auth/mfa?returnTo=${encodeURIComponent(`/${locale}/team-resources`)}`}
              >
                {message("verify")}
              </Link>
            ) : null
          }
        />
        <fieldset
          disabled={mutation.isPending}
          className="grid min-w-0 gap-4 border-0 p-0"
        >
          {children({
            control: form.control as unknown as AccessControl,
            pending: mutation.isPending,
            confirm: () => mutation.mutate({ ...form.getValues(), confirm: "yes" }),
          })}
        </fieldset>
      </form>
    </Form>
  );
}
function AssignmentFields({
  workspace,
  locale,
  control,
  idPrefix,
}: {
  workspace: StaffAccessWorkspaceV1;
  locale: Locale;
  control: AccessControl;
  idPrefix: string;
}) {
  const message = (key: StaffAccessMessage) => staffAccessMessage(locale, key);
  return (
    <>
      <FieldGroup columns={2}>
        <SelectField
          control={control}
          name="roleId"
          label={message("role")}
          required
          options={workspace.roles.map((role) => ({
            value: role.id,
            label: staffRoleName(locale, role.key),
          }))}
        />
      </FieldGroup>
      <CheckboxGroupField
        control={control}
        name="locationIds"
        idPrefix={idPrefix}
        label={message("locations")}
        description={message("locationHint")}
        options={workspace.locations.map((location) => ({
          value: location.id,
          label: location.name,
        }))}
      />
    </>
  );
}
export function StaffAccessPanel({
  locale,
  workspace,
  attempts,
}: {
  locale: Locale;
  workspace: StaffAccessWorkspaceV1;
  attempts: readonly string[];
}) {
  const message = (key: StaffAccessMessage) => staffAccessMessage(locale, key);
  let next = 0;
  const attempt = () => attempts[next++]!;
  return (
    <Section id="staff-access" title={message("title")} description={message("hint")}>
      <div className="grid rounded-lg border bg-card px-5 pt-1 [&>details:first-child]:border-t-0">
        <Disclosure summary={message("invite")}>
          <AccessForm
            locale={locale}
            operation="invite"
            requestId={attempt()}
            roleId={workspace.roles.find((role) => role.key === "staff")?.id ?? ""}
          >
            {({ control, pending }) => (
              <>
                <FieldGroup columns={2}>
                  <TextField
                    control={control}
                    name="email"
                    label={message("email")}
                    required
                    type="email"
                    dir="ltr"
                    maxLength={254}
                    autoComplete="off"
                  />
                </FieldGroup>
                <AssignmentFields
                  workspace={workspace}
                  locale={locale}
                  control={control}
                  idPrefix="staff-access-invite-location"
                />
                <FormActions>
                  <Button
                    type="submit"
                    loading={pending}
                    loadingLabel={message("working")}
                  >
                    <Send aria-hidden="true" />
                    {message("invite")}
                  </Button>
                </FormActions>
              </>
            )}
          </AccessForm>
        </Disclosure>
      </div>
      <div className="grid gap-3">
        <h3 className="text-base font-semibold">{message("members")}</h3>
        {workspace.members.length ? (
          <ul className="grid divide-y rounded-lg border bg-card">
            {workspace.members.map((member) => (
              <li key={member.id} className="grid gap-3 px-5 pt-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="grid gap-0.5">
                    <h4 className="text-sm font-semibold text-foreground">
                      {member.name}
                    </h4>
                    <p className="text-sm text-muted-foreground">
                      <bdi>{member.email}</bdi> ·{" "}
                      {staffRoleName(
                        locale,
                        workspace.roles.find((role) => role.id === member.roleId)!.key,
                      )}
                    </p>
                  </div>
                  <StatusStamp state={stamp(member.status)}>
                    {message(member.status)}
                  </StatusStamp>
                </div>
                <div className="grid">
                  <Disclosure summary={message("save")}>
                    <AccessForm
                      locale={locale}
                      operation="edit_membership"
                      targetId={member.id}
                      revision={member.revision}
                      requestId={attempt()}
                      roleId={member.roleId}
                      locationIds={member.locationIds}
                    >
                      {({ control, pending }) => (
                        <>
                          <AssignmentFields
                            workspace={workspace}
                            locale={locale}
                            control={control}
                            idPrefix={`staff-access-${member.id}-location`}
                          />
                          <FormActions>
                            <Button
                              type="submit"
                              loading={pending}
                              loadingLabel={message("working")}
                            >
                              {message("save")}
                            </Button>
                          </FormActions>
                        </>
                      )}
                    </AccessForm>
                  </Disclosure>
                  {member.status !== "revoked" ? (
                    <Disclosure summary={message("revoke")} tone="danger">
                      <AccessForm
                        locale={locale}
                        operation="revoke_membership"
                        targetId={member.id}
                        revision={member.revision}
                        requestId={attempt()}
                      >
                        {({ pending, confirm }) => (
                          <FormActions className="border-t-0 pt-0">
                            <ConfirmAction
                              destructive
                              onConfirm={confirm}
                              label={message("revoke")}
                              pending={pending}
                              pendingLabel={message("working")}
                              title={message("revokeTitle")}
                              description={message("confirm")}
                              confirmLabel={message("revoke")}
                              cancelLabel={message("cancel")}
                            />
                          </FormActions>
                        )}
                      </AccessForm>
                    </Disclosure>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title={message("noMembers")} />
        )}
      </div>
      <div className="grid gap-3">
        <h3 className="text-base font-semibold">{message("invitations")}</h3>
        {workspace.invitations.length ? (
          <ul className="grid divide-y rounded-lg border bg-card">
            {workspace.invitations.map((invitation) => (
              <li key={invitation.id} className="grid gap-3 px-5 py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="grid gap-0.5">
                    <p className="text-sm font-semibold text-foreground">
                      <bdi>{invitation.email}</bdi>
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {formatWhen(invitation.expiresAt, locale, "UTC")} · <bdi>UTC</bdi>
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusStamp state={stamp(invitation.status)}>
                      {message(invitation.status)}
                    </StatusStamp>
                    <StatusStamp state={stamp(invitation.deliveryStatus)}>
                      {message(invitation.deliveryStatus)}
                    </StatusStamp>
                  </div>
                </div>
                {["pending", "expired"].includes(invitation.status) ? (
                  <div className="flex flex-wrap items-start gap-3">
                    <AccessForm
                      locale={locale}
                      operation="resend"
                      targetId={invitation.id}
                      revision={invitation.revision}
                      requestId={attempt()}
                    >
                      {({ pending }) => (
                        <div>
                          <Button
                            type="submit"
                            variant="outline"
                            size="sm"
                            loading={pending}
                            loadingLabel={message("working")}
                          >
                            <Send aria-hidden="true" />
                            {message("resend")}
                          </Button>
                        </div>
                      )}
                    </AccessForm>
                    <AccessForm
                      locale={locale}
                      operation="revoke_invitation"
                      targetId={invitation.id}
                      revision={invitation.revision}
                      requestId={attempt()}
                    >
                      {({ pending, confirm }) => (
                        <div>
                          <ConfirmAction
                            destructive
                            onConfirm={confirm}
                            variant="destructive-outline"
                            size="sm"
                            label={message("revokeInvitation")}
                            pending={pending}
                            pendingLabel={message("working")}
                            title={message("revokeInvitationTitle")}
                            description={message("revokeInvitationConfirm")}
                            confirmLabel={message("revokeInvitation")}
                            cancelLabel={message("cancel")}
                          />
                        </div>
                      )}
                    </AccessForm>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title={message("empty")} />
        )}
      </div>
    </Section>
  );
}
