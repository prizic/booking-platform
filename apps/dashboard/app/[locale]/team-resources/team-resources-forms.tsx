"use client";
import { useRouter } from "next/navigation";
import {
  useWatch,
  type DefaultValues,
  type FieldValues,
  type Path,
} from "react-hook-form";
import type { z } from "zod";
import type {
  ResourceTypeChoiceV1,
  StaffAccessMemberV1,
  StaffResourceChoiceV1,
  StaffResourceWorkspaceItemV1,
} from "@wlbp/api-contracts";
import type { Locale } from "@wlbp/i18n";
import {
  Button,
  FieldGroup,
  Form,
  applyActionErrors,
  useActionMutation,
  useZodForm,
  type ButtonVariant,
} from "@wlbp/ui-foundation";
import type { ReactNode } from "react";
import { dashboardFormMessages } from "../../_lib/form-messages";
import {
  getTeamResourcesMessage,
  type TeamResourcesMessageKey,
} from "../../_lib/team-resources-copy";
import { FormActions } from "../services/form-kit";
import { SelectField, TextField, type FormControlOf } from "../services/form-fields";
import {
  newAttemptId,
  useAuthoritativeDefaults,
  useResultNavigation,
} from "../services/form-hooks";
import { MutationFeedback } from "../services/mutation-feedback";
import type { TeamResourcesActionResult } from "./actions";
import { staffAccessMessage } from "./staff-access";
import {
  NO_LINKED_ACCOUNT,
  resourceDeactivationSchema,
  resourceLocationEligibilitySchema,
  resourceRequirementSchema,
  resourceSchema,
  resourceTypeSchema,
  staffDeactivationSchema,
  staffEligibilitySchema,
  staffProfileSchema,
  type ResourceDeactivationInput,
  type ResourceInput,
  type ResourceLocationEligibilityInput,
  type ResourceRequirementInput,
  type ResourceTypeInput,
  type StaffDeactivationInput,
  type StaffEligibilityInput,
  type StaffProfileInput,
} from "./team-resources-schema";

/** Error codes the Team and resources forms render, in one language. */
export function teamResourcesFormMessages(
  locale: Locale,
): Readonly<Record<string, string>> {
  const message = (key: TeamResourcesMessageKey) =>
    getTeamResourcesMessage(locale, key);
  return {
    ...dashboardFormMessages(locale),
    invalid: message("fieldError"),
    "invalid-request": message("invalidRequest"),
    "not-authorized": message("notAuthorized"),
    "revision-conflict": message("revisionConflict"),
    "backend-unavailable": message("backendUnavailable"),
    team_key_invalid:
      locale === "ar"
        ? "استخدم أحرفًا إنجليزية صغيرة وأرقامًا وشرطات مفردة فقط."
        : "Use lowercase letters, digits and single hyphens only.",
  };
}

type Action<I> = (input: I) => Promise<TeamResourcesActionResult>;

/**
 * The shared editor plumbing: one schema, one mutation. A success clears the
 * editor and shows the page's result banner; a failure keeps the operator's
 * values. Only an unavailable backend keeps the attempt id, so a retry is the
 * same idempotent attempt (as the former retry link did).
 */
function TeamForm<S extends z.ZodType<FieldValues, FieldValues>>({
  schema,
  defaults,
  action,
  locale,
  submitLabel,
  submitVariant = "default",
  children,
}: {
  schema: S;
  defaults: z.input<S>;
  action: Action<z.input<S>>;
  locale: Locale;
  submitLabel: string;
  submitVariant?: ButtonVariant;
  children: (control: FormControlOf<z.input<S>, z.output<S>>) => ReactNode;
}) {
  const router = useRouter();
  const navigate = useResultNavigation();
  const messages = teamResourcesFormMessages(locale);
  const form = useZodForm(schema, {
    defaultValues: defaults as DefaultValues<z.input<S>>,
  });
  useAuthoritativeDefaults(form, defaults as DefaultValues<z.input<S>>);
  const mutation = useActionMutation(action, {
    refresh: false,
    onFailure: (result) => {
      applyActionErrors(form, result);
      if (result.formError !== "backend-unavailable")
        form.setValue("requestId" as Path<z.input<S>>, newAttemptId() as never);
    },
    onSuccess: (data) => {
      form.reset();
      navigate(data.destination);
    },
  });
  const requestId = useWatch({
    control: form.control,
    name: "requestId" as Path<z.input<S>>,
  }) as string;
  const formId = (defaults as { formId: string }).formId;
  return (
    <Form form={form} locale={locale} messages={messages}>
      <form
        noValidate
        className="grid gap-5 pt-1"
        data-form-id={formId}
        data-request-id={requestId}
        onSubmit={form.handleSubmit(() => mutation.mutate(form.getValues()))}
      >
        {children(form.control)}
        <MutationFeedback
          locale={locale}
          messages={messages}
          result={mutation.data?.ok === false ? mutation.data : undefined}
          transportFailed={mutation.isError}
          reload={{
            codes: ["revision-conflict"],
            label: locale === "ar" ? "إعادة التحميل والمراجعة" : "Reload and review",
            onReload: () => router.refresh(),
          }}
        />
        <FormActions>
          <Button type="submit" variant={submitVariant} loading={mutation.isPending}>
            {submitLabel}
          </Button>
        </FormActions>
      </form>
    </Form>
  );
}

interface Common {
  readonly locale: Locale;
  readonly formId: string;
  readonly requestId: string;
}

function ReasonField<T extends FieldValues, TOut>({
  control,
  locale,
}: {
  control: FormControlOf<T, TOut>;
  locale: Locale;
}) {
  return (
    <TextField
      control={control}
      name={"reason" as Path<T>}
      label={getTeamResourcesMessage(locale, "deactivateReason")}
      required
      maxLength={500}
    />
  );
}

function choiceOptions(choices: readonly StaffResourceChoiceV1[]) {
  return choices.map((choice) => ({ value: choice.id, label: choice.name }));
}

export function staffFormDefaults(
  { locale, formId, requestId }: Common,
  item?: StaffResourceWorkspaceItemV1,
): StaffProfileInput {
  return {
    locale,
    formId,
    requestId,
    reason: "",
    staffId: item?.id ?? "",
    expectedRevision: item ? String(item.revision) : "",
    publicName: item?.name ?? "",
    membershipId: item?.membershipId ?? NO_LINKED_ACCOUNT,
    bio: item?.publicBio ?? "",
    internalNotes: item?.internalNotes ?? "",
    offeredHoursPerWeek: String(item?.offeredHoursPerWeek ?? 40),
  };
}

export function StaffForm({
  action,
  item,
  members = [],
  ...common
}: Common & {
  readonly action: Action<StaffProfileInput>;
  readonly item?: StaffResourceWorkspaceItemV1;
  readonly members?: readonly StaffAccessMemberV1[];
}) {
  const { locale } = common;
  const message = (key: TeamResourcesMessageKey) =>
    getTeamResourcesMessage(locale, key);
  return (
    <TeamForm
      schema={staffProfileSchema}
      defaults={staffFormDefaults(common, item)}
      action={action}
      locale={locale}
      submitLabel={message(item === undefined ? "submitStaff" : "saveStaff")}
    >
      {(control) => (
        <FieldGroup columns={2}>
          <TextField
            control={control}
            name="publicName"
            label={message("publicName")}
            required
            maxLength={160}
          />
          <SelectField
            control={control}
            name="membershipId"
            label={staffAccessMessage(locale, "account")}
            options={[
              {
                value: NO_LINKED_ACCOUNT,
                label: staffAccessMessage(locale, "noAccount"),
              },
              ...(item?.membershipId &&
              !members.some((member) => member.id === item.membershipId)
                ? [
                    {
                      value: item.membershipId,
                      label: staffAccessMessage(locale, "currentAccount"),
                    },
                  ]
                : []),
              ...members.map((member) => ({
                value: member.id,
                label: (
                  <>
                    {member.name} — <bdi>{member.email}</bdi>
                  </>
                ),
              })),
            ]}
          />
          <TextField
            control={control}
            name="bio"
            label={message("publicBio")}
            multiline
            maxLength={2000}
          />
          <TextField
            control={control}
            name="internalNotes"
            label={message("internalNotes")}
            multiline
            maxLength={2000}
          />
          <TextField
            control={control}
            name="offeredHoursPerWeek"
            label={message("offeredHours")}
            required
            type="number"
            min="0.25"
            max="168"
            step="0.25"
          />
          <ReasonField control={control} locale={locale} />
        </FieldGroup>
      )}
    </TeamForm>
  );
}

export function resourceTypeFormDefaults(
  { locale, formId, requestId }: Common,
  resourceType?: ResourceTypeChoiceV1,
): ResourceTypeInput {
  return {
    locale,
    formId,
    requestId,
    reason: "",
    resourceTypeId: resourceType?.id ?? "",
    expectedRevision: resourceType ? String(resourceType.revision) : "",
    key: resourceType?.key ?? "",
    name: resourceType?.name ?? "",
    exclusive: true,
  };
}

export function ResourceTypeForm({
  action,
  resourceType,
  ...common
}: Common & {
  readonly action: Action<ResourceTypeInput>;
  readonly resourceType?: ResourceTypeChoiceV1;
}) {
  const { locale } = common;
  const message = (key: TeamResourcesMessageKey) =>
    getTeamResourcesMessage(locale, key);
  return (
    <TeamForm
      schema={resourceTypeSchema}
      defaults={resourceTypeFormDefaults(common, resourceType)}
      action={action}
      locale={locale}
      submitLabel={message(
        resourceType === undefined ? "submitResourceType" : "saveResourceType",
      )}
    >
      {(control) => (
        <FieldGroup columns={2}>
          <TextField
            control={control}
            name="key"
            label={message("key")}
            required
            autoComplete="off"
            dir="ltr"
            maxLength={80}
          />
          <TextField
            control={control}
            name="name"
            label={message("name")}
            required
            maxLength={160}
          />
          <ReasonField control={control} locale={locale} />
        </FieldGroup>
      )}
    </TeamForm>
  );
}

export function resourceFormDefaults(
  { locale, formId, requestId }: Common,
  item?: StaffResourceWorkspaceItemV1,
): ResourceInput {
  return {
    locale,
    formId,
    requestId,
    reason: "",
    resourceId: item?.id ?? "",
    expectedRevision: item ? String(item.revision) : "",
    resourceTypeId: item?.resourceTypeId ?? "",
    key: item?.key ?? "",
    publicName: item?.name ?? "",
    status: item?.status === "maintenance" ? "maintenance" : "active",
    internalNotes: item?.internalNotes ?? "",
  };
}

export function ResourceForm({
  action,
  item,
  resourceTypes,
  ...common
}: Common & {
  readonly action: Action<ResourceInput>;
  readonly item?: StaffResourceWorkspaceItemV1;
  readonly resourceTypes: readonly ResourceTypeChoiceV1[];
}) {
  const { locale } = common;
  const message = (key: TeamResourcesMessageKey) =>
    getTeamResourcesMessage(locale, key);
  return (
    <TeamForm
      schema={resourceSchema}
      defaults={resourceFormDefaults(common, item)}
      action={action}
      locale={locale}
      submitLabel={message(item === undefined ? "submitResource" : "saveResource")}
    >
      {(control) => (
        <FieldGroup columns={2}>
          <SelectField
            control={control}
            name="resourceTypeId"
            label={message("resourceTypeId")}
            required
            placeholder="—"
            options={choiceOptions(resourceTypes)}
          />
          <TextField
            control={control}
            name="key"
            label={message("key")}
            required
            autoComplete="off"
            dir="ltr"
            maxLength={80}
          />
          <TextField
            control={control}
            name="publicName"
            label={message("publicName")}
            required
            maxLength={160}
          />
          <SelectField
            control={control}
            name="status"
            label={message("status")}
            options={[
              { value: "active", label: message("active") },
              { value: "maintenance", label: message("maintenance") },
            ]}
          />
          <TextField
            control={control}
            name="internalNotes"
            label={message("internalNotes")}
            multiline
            maxLength={2000}
            className="md:col-span-2"
          />
          <ReasonField control={control} locale={locale} />
        </FieldGroup>
      )}
    </TeamForm>
  );
}

export function RequirementForm({
  action,
  resourceTypes,
  services,
  ...common
}: Common & {
  readonly action: Action<ResourceRequirementInput>;
  readonly resourceTypes: readonly ResourceTypeChoiceV1[];
  readonly services: readonly StaffResourceChoiceV1[];
}) {
  const { locale, formId, requestId } = common;
  const message = (key: TeamResourcesMessageKey) =>
    getTeamResourcesMessage(locale, key);
  return (
    <TeamForm
      schema={resourceRequirementSchema}
      defaults={{
        locale,
        formId,
        requestId,
        reason: "",
        serviceId: "",
        resourceTypeId: "",
        required: "true",
      }}
      action={action}
      locale={locale}
      submitLabel={message("updateRequirement")}
    >
      {(control) => (
        <FieldGroup columns={2}>
          <SelectField
            control={control}
            name="serviceId"
            label={message("serviceId")}
            required
            placeholder="—"
            options={choiceOptions(services)}
          />
          <SelectField
            control={control}
            name="resourceTypeId"
            label={message("resourceTypeId")}
            required
            placeholder="—"
            options={choiceOptions(resourceTypes)}
          />
          <SelectField
            control={control}
            name="required"
            label={message("resourceRequired")}
            options={[
              { value: "true", label: message("setEligible") },
              { value: "false", label: message("setIneligible") },
            ]}
          />
          <ReasonField control={control} locale={locale} />
        </FieldGroup>
      )}
    </TeamForm>
  );
}

export function EligibilityForm({
  staffAction,
  resourceAction,
  item,
  locations,
  services,
  ...common
}: Common & {
  readonly staffAction: Action<StaffEligibilityInput>;
  readonly resourceAction: Action<ResourceLocationEligibilityInput>;
  readonly item: StaffResourceWorkspaceItemV1;
  readonly locations: readonly StaffResourceChoiceV1[];
  readonly services: readonly StaffResourceChoiceV1[];
}) {
  const { locale, formId, requestId } = common;
  const message = (key: TeamResourcesMessageKey) =>
    getTeamResourcesMessage(locale, key);
  const eligibleField = (
    control: FormControlOf<{ locationId: string; eligible: string }, unknown>,
  ) => (
    <>
      <SelectField
        control={control}
        name="locationId"
        label={message("locationId")}
        required
        placeholder="—"
        options={choiceOptions(locations)}
      />
      <SelectField
        control={control}
        name="eligible"
        label={message("updateEligibility")}
        options={[
          { value: "true", label: message("setEligible") },
          { value: "false", label: message("setIneligible") },
        ]}
      />
    </>
  );
  if (item.kind === "staff")
    return (
      <TeamForm
        schema={staffEligibilitySchema}
        defaults={{
          locale,
          formId,
          requestId,
          reason: "",
          staffId: item.id,
          serviceId: "",
          locationId: "",
          eligible: "true",
        }}
        action={staffAction}
        locale={locale}
        submitLabel={message("updateEligibility")}
        submitVariant="outline"
      >
        {(control) => (
          <FieldGroup columns={2}>
            <SelectField
              control={control}
              name="serviceId"
              label={message("serviceId")}
              required
              placeholder="—"
              options={choiceOptions(services)}
            />
            {eligibleField(control as never)}
            <ReasonField control={control} locale={locale} />
          </FieldGroup>
        )}
      </TeamForm>
    );
  return (
    <TeamForm
      schema={resourceLocationEligibilitySchema}
      defaults={{
        locale,
        formId,
        requestId,
        reason: "",
        resourceId: item.id,
        locationId: "",
        eligible: "true",
      }}
      action={resourceAction}
      locale={locale}
      submitLabel={message("updateEligibility")}
      submitVariant="outline"
    >
      {(control) => (
        <FieldGroup columns={2}>
          {eligibleField(control as never)}
          <ReasonField control={control} locale={locale} />
        </FieldGroup>
      )}
    </TeamForm>
  );
}

export function DeactivationForm({
  staffAction,
  resourceAction,
  item,
  replacements,
  ...common
}: Common & {
  readonly staffAction: Action<StaffDeactivationInput>;
  readonly resourceAction: Action<ResourceDeactivationInput>;
  readonly item: StaffResourceWorkspaceItemV1;
  readonly replacements: readonly StaffResourceWorkspaceItemV1[];
}) {
  const { locale, formId, requestId } = common;
  const message = (key: TeamResourcesMessageKey) =>
    getTeamResourcesMessage(locale, key);
  const resolutionField = (control: FormControlOf<{ resolution: string }, unknown>) => (
    <SelectField
      control={control}
      name="resolution"
      label={message("deactivateResolution")}
      options={[
        { value: "defer", label: message("deferDeactivation") },
        { value: "cancel", label: message("cancelFuture") },
        {
          value: "reassign",
          label: message("reassignFuture"),
          disabled: replacements.length === 0,
        },
      ]}
    />
  );
  const replacementOptions = replacements.map((replacement) => ({
    value: replacement.id,
    label: replacement.name,
  }));
  const shared = {
    locale,
    submitLabel: message("submitDeactivation"),
    submitVariant: "destructive" as const,
  };
  if (item.kind === "staff")
    return (
      <TeamForm
        schema={staffDeactivationSchema}
        defaults={{
          locale,
          formId,
          requestId,
          reason: "",
          staffId: item.id,
          resolution: "defer",
          replacementStaffId: replacements.at(0)?.id ?? "",
        }}
        action={staffAction}
        {...shared}
      >
        {(control) => (
          <FieldGroup columns={2}>
            {resolutionField(control as never)}
            <SelectField
              control={control}
              name="replacementStaffId"
              label={message("replacementStaff")}
              required={replacements.length > 0}
              disabled={replacements.length === 0}
              placeholder="—"
              options={replacementOptions}
            />
            <ReasonField control={control} locale={locale} />
          </FieldGroup>
        )}
      </TeamForm>
    );
  return (
    <TeamForm
      schema={resourceDeactivationSchema}
      defaults={{
        locale,
        formId,
        requestId,
        reason: "",
        resourceId: item.id,
        resolution: "defer",
        replacementResourceId: replacements.at(0)?.id ?? "",
      }}
      action={resourceAction}
      {...shared}
    >
      {(control) => (
        <FieldGroup columns={2}>
          {resolutionField(control as never)}
          <SelectField
            control={control}
            name="replacementResourceId"
            label={message("replacementResource")}
            required={replacements.length > 0}
            disabled={replacements.length === 0}
            placeholder="—"
            options={replacementOptions}
          />
          <ReasonField control={control} locale={locale} />
        </FieldGroup>
      )}
    </TeamForm>
  );
}
