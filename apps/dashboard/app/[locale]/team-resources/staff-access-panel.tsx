"use client";
import { useActionState, useEffect, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { StaffAccessWorkspaceV1 } from "@wlbp/api-contracts";
import type { Locale } from "@wlbp/i18n";
import { formatDateTime } from "@wlbp/i18n";
import { changeStaffAccessAction } from "./staff-access-actions";
import { staffAccessMessage, staffRoleName } from "./staff-access";

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
  children: ReactNode;
}) {
  const [state, action, pending] = useActionState(changeStaffAccessAction, {});
  const attempt = state.nextRequestId ?? requestId;
  const router = useRouter();
  useEffect(() => {
    if (state.saved) {
      router.refresh();
    }
  }, [state, router]);
  const message = (key: Parameters<typeof staffAccessMessage>[1]) =>
    staffAccessMessage(locale, key);
  return (
    <form action={action} className="auth-form">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="operation" value={operation} />
      <input type="hidden" name="targetId" value={targetId ?? ""} />
      <input type="hidden" name="expectedRevision" value={revision ?? ""} />
      <input type="hidden" name="requestId" value={attempt} />
      {state.message ? (
        <p role={state.saved ? "status" : "alert"}>
          {message(state.message)}
          {state.message === "step_up_required" ? (
            <>
              {" "}
              <Link
                href={`/${locale}/auth/mfa?returnTo=${encodeURIComponent(`/${locale}/team-resources`)}`}
              >
                {message("save")}
              </Link>
            </>
          ) : null}
          {state.message === "revision_conflict" ? (
            <>
              {" "}
              <button
                className="wlbp-button wlbp-button--quiet"
                type="button"
                onClick={() => router.refresh()}
              >
                {locale === "en" ? "Reload access" : "إعادة تحميل الصلاحية"}
              </button>
            </>
          ) : null}
        </p>
      ) : null}
      <fieldset disabled={pending}>{children}</fieldset>
      {pending ? <p role="status">{message("working")}</p> : null}
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
  const message = (key: Parameters<typeof staffAccessMessage>[1]) =>
    staffAccessMessage(locale, key);
  return (
    <>
      <label>
        {message("role")}
        <select
          className="wlbp-field__input"
          name="roleId"
          required
          defaultValue={
            roleId ?? workspace.roles.find((role) => role.key === "staff")?.id
          }
        >
          {workspace.roles.map((role) => (
            <option key={role.id} value={role.id}>
              {staffRoleName(locale, role.key)}
            </option>
          ))}
        </select>
      </label>
      <fieldset>
        <legend>{message("locations")}</legend>
        <p>{message("locationHint")}</p>
        {workspace.locations.map((location) => (
          <label className="workspace-checkbox" key={location.id}>
            <input
              type="checkbox"
              name="locationIds"
              value={location.id}
              defaultChecked={locationIds.includes(location.id)}
            />
            {location.name}
          </label>
        ))}
      </fieldset>
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
  const message = (key: Parameters<typeof staffAccessMessage>[1]) =>
    staffAccessMessage(locale, key);
  let next = 0;
  const attempt = () => attempts[next++]!;
  return (
    <section className="workspace-section" aria-labelledby="staff-access-title">
      <h2 id="staff-access-title">{message("title")}</h2>
      <p>{message("hint")}</p>
      <details>
        <summary>{message("invite")}</summary>
        <AccessForm locale={locale} operation="invite" requestId={attempt()}>
          <label>
            {message("email")}
            <input
              className="wlbp-field__input"
              type="email"
              name="email"
              required
              maxLength={254}
              autoComplete="off"
            />
          </label>
          <AssignmentFields workspace={workspace} locale={locale} />
          <button className="wlbp-button">{message("invite")}</button>
        </AccessForm>
      </details>
      <ul className="workspace-record-list">
        {workspace.members.map((member) => (
          <li key={member.id}>
            <h3>{member.name}</h3>
            <p>
              <bdi>{member.email}</bdi> · {message(member.status)} ·{" "}
              {staffRoleName(
                locale,
                workspace.roles.find((role) => role.id === member.roleId)!.key,
              )}
            </p>
            <details>
              <summary>{message("save")}</summary>
              <AccessForm
                locale={locale}
                operation="edit_membership"
                targetId={member.id}
                revision={member.revision}
                requestId={attempt()}
              >
                <AssignmentFields
                  workspace={workspace}
                  locale={locale}
                  roleId={member.roleId}
                  locationIds={member.locationIds}
                />
                <button className="wlbp-button">{message("save")}</button>
              </AccessForm>
            </details>
            {member.status !== "revoked" ? (
              <details>
                <summary>{message("revoke")}</summary>
                <AccessForm
                  locale={locale}
                  operation="revoke_membership"
                  targetId={member.id}
                  revision={member.revision}
                  requestId={attempt()}
                >
                  <label>
                    <input type="checkbox" name="confirm" value="yes" required />
                    {message("confirm")}
                  </label>
                  <button className="wlbp-button wlbp-button--danger">
                    {message("revoke")}
                  </button>
                </AccessForm>
              </details>
            ) : null}
          </li>
        ))}
      </ul>
      <h3>{message("invite")}</h3>
      {workspace.invitations.length ? (
        <ul className="workspace-record-list">
          {workspace.invitations.map((invitation) => (
            <li key={invitation.id}>
              <p>
                <bdi>{invitation.email}</bdi> · {message(invitation.status)} ·{" "}
                {message(invitation.deliveryStatus)}
              </p>
              <p>
                {formatDateTime(invitation.expiresAt, locale, "UTC")} · <bdi>UTC</bdi>
              </p>
              {["pending", "expired"].includes(invitation.status) ? (
                <>
                  <AccessForm
                    locale={locale}
                    operation="resend"
                    targetId={invitation.id}
                    revision={invitation.revision}
                    requestId={attempt()}
                  >
                    <button className="wlbp-button wlbp-button--quiet">
                      {message("resend")}
                    </button>
                  </AccessForm>
                  <details>
                    <summary>{message("revokeInvitation")}</summary>
                    <AccessForm
                      locale={locale}
                      operation="revoke_invitation"
                      targetId={invitation.id}
                      revision={invitation.revision}
                      requestId={attempt()}
                    >
                      <label>
                        <input type="checkbox" name="confirm" value="yes" required />
                        {message("confirm")}
                      </label>
                      <button className="wlbp-button wlbp-button--danger">
                        {message("revokeInvitation")}
                      </button>
                    </AccessForm>
                  </details>
                </>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p>{message("empty")}</p>
      )}
    </section>
  );
}
