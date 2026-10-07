"use client";
import { useActionState, useEffect, useId, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, RotateCw, Send } from "lucide-react";
import type { StaffAccessWorkspaceV1 } from "@wlbp/api-contracts";
import type { Locale } from "@wlbp/i18n";
import { formatWhen } from "../../_lib/booking-display";
import {
  Alert,
  AlertDescription,
  Button,
  EmptyState,
  Field,
  FieldDescription,
  FieldGroup,
  FieldLegend,
  FieldSet,
  Input,
  Label,
  RequiredMark,
  Section,
  StatusStamp,
  type StampState,
} from "@wlbp/ui-foundation";
import { ConfirmSubmit } from "../services/confirm-submit";
import { CheckboxRow, ChoiceSelect, FormActions } from "../services/form-kit";
import { changeStaffAccessAction } from "./staff-access-actions";
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

function AccessForm({
  locale,
  operation,
  targetId,
  revision,
  requestId,
  children,
}: {
  locale: Locale;
  operation: string;
  targetId?: string;
  revision?: number;
  requestId: string;
  children: (pending: boolean) => ReactNode;
}) {
  const [state, action, pending] = useActionState(changeStaffAccessAction, {});
  const attempt = state.nextRequestId ?? requestId;
  const router = useRouter();
  useEffect(() => {
    if (state.saved) {
      router.refresh();
    }
  }, [state, router]);
  const message = (key: StaffAccessMessage) => staffAccessMessage(locale, key);
  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="operation" value={operation} />
      <input type="hidden" name="targetId" value={targetId ?? ""} />
      <input type="hidden" name="expectedRevision" value={revision ?? ""} />
      <input type="hidden" name="requestId" value={attempt} />
      {state.message ? (
        <Alert tone={state.saved ? "positive" : "danger"}>
          <AlertDescription className="flex flex-wrap items-center gap-3 text-foreground">
            <span>{message(state.message)}</span>
            {state.message === "step_up_required" ? (
              <Link
                className="font-semibold text-primary underline-offset-4 hover:underline"
                href={`/${locale}/auth/mfa?returnTo=${encodeURIComponent(`/${locale}/team-resources`)}`}
              >
                {message("verify")}
              </Link>
            ) : null}
            {state.message === "revision_conflict" ? (
              <Button
                variant="outline"
                size="sm"
                type="button"
                onClick={() => router.refresh()}
              >
                <RotateCw aria-hidden="true" />
                {message("reload")}
              </Button>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}
      <fieldset disabled={pending} className="grid min-w-0 gap-4 border-0 p-0">
        {children(pending)}
      </fieldset>
    </form>
  );
}
function AssignmentFields({
  workspace,
  locale,
  roleId,
  locationIds = [],
}: {
  workspace: StaffAccessWorkspaceV1;
  locale: Locale;
  roleId?: string;
  locationIds?: readonly string[];
}) {
  const id = useId();
  const message = (key: StaffAccessMessage) => staffAccessMessage(locale, key);
  return (
    <>
      <FieldGroup columns={2}>
        <Field>
          <Label htmlFor={`${id}-role`}>
            {message("role")}
            <RequiredMark />
          </Label>
          <ChoiceSelect
            id={`${id}-role`}
            name="roleId"
            required
            defaultValue={
              roleId ?? workspace.roles.find((role) => role.key === "staff")?.id ?? ""
            }
            options={workspace.roles.map((role) => ({
              value: role.id,
              label: staffRoleName(locale, role.key),
            }))}
          />
        </Field>
      </FieldGroup>
      <FieldSet className="gap-1">
        <FieldLegend className="text-sm">{message("locations")}</FieldLegend>
        <FieldDescription>{message("locationHint")}</FieldDescription>
        <div className="grid gap-x-6 md:grid-cols-2">
          {workspace.locations.map((location) => (
            <CheckboxRow
              key={location.id}
              id={`${id}-location-${location.id}`}
              name="locationIds"
              value={location.id}
              defaultChecked={locationIds.includes(location.id)}
            >
              {location.name}
            </CheckboxRow>
          ))}
        </div>
      </FieldSet>
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
          <AccessForm locale={locale} operation="invite" requestId={attempt()}>
            {(pending) => (
              <>
                <FieldGroup columns={2}>
                  <Field>
                    <Label htmlFor="staff-access-invite-email">
                      {message("email")}
                      <RequiredMark />
                    </Label>
                    <Input
                      id="staff-access-invite-email"
                      type="email"
                      name="email"
                      dir="ltr"
                      required
                      maxLength={254}
                      autoComplete="off"
                    />
                  </Field>
                </FieldGroup>
                <AssignmentFields workspace={workspace} locale={locale} />
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
                    >
                      {(pending) => (
                        <>
                          <AssignmentFields
                            workspace={workspace}
                            locale={locale}
                            roleId={member.roleId}
                            locationIds={member.locationIds}
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
                        {(pending) => (
                          <FormActions className="border-t-0 pt-0">
                            <ConfirmSubmit
                              destructive
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
                      {(pending) => (
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
                      {(pending) => (
                        <div>
                          <ConfirmSubmit
                            destructive
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
