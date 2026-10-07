"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, Trash2 } from "lucide-react";
import { useFieldArray, useWatch } from "react-hook-form";
import type { z } from "zod";
import type {
  CatalogEntityV1,
  CatalogKindV1,
  CatalogWorkspaceV1,
} from "@wlbp/api-contracts";
import { formatNumber, type Locale } from "@wlbp/i18n";
import {
  Button,
  FieldGroup,
  FieldLegend,
  FieldSet,
  Form,
  Section,
  StatusStamp,
  useActionMutation,
  useZodForm,
  applyActionErrors,
} from "@wlbp/ui-foundation";
import {
  catalogErrorMessages,
  catalogMessage,
  type CatalogMessageKey,
} from "./catalog-copy";
import { saveCatalogDraftAction, publishCatalogAction } from "./actions";
import {
  CATALOG_NO_LINK,
  catalogContentSchema,
  catalogDraftSchema,
  catalogPriceInput,
  type CatalogEditorValues,
  type CatalogIntakeValues,
} from "./catalog-schema";
import { ConfirmAction } from "./confirm-submit";
import { FormActions } from "./form-kit";
import {
  CheckboxField,
  CheckboxGroupField,
  SelectField,
  TextField,
} from "./form-fields";
import {
  newAttemptId,
  useAuthoritativeDefaults,
  useResultNavigation,
} from "./form-hooks";
import { MutationFeedback } from "./mutation-feedback";
import { dashboardToast } from "../../_lib/ui/use-workspace-mutation";

const panel = "grid gap-5 rounded-lg border bg-card p-5 md:p-6";

function intakeFields(entity?: CatalogEntityV1): CatalogIntakeValues[] {
  const fields = entity?.intake_schema.fields;
  const arabic = entity?.intake_schema_ar.fields;
  return (Array.isArray(fields) ? fields : []).flatMap((entry: unknown) => {
    if (
      typeof entry !== "object" ||
      entry === null ||
      !("key" in entry) ||
      !("label" in entry) ||
      typeof entry.key !== "string" ||
      typeof entry.label !== "string"
    )
      return [];
    const matched: unknown = Array.isArray(arabic)
      ? arabic.find(
          (candidate: unknown) =>
            typeof candidate === "object" &&
            candidate !== null &&
            "key" in candidate &&
            candidate.key === entry.key,
        )
      : undefined;
    return [
      {
        rowId: entry.key,
        key: entry.key,
        en: entry.label,
        ar:
          typeof matched === "object" &&
          matched !== null &&
          "label" in matched &&
          typeof matched.label === "string"
            ? matched.label
            : "",
        required: "required" in entry && entry.required === true,
      },
    ];
  });
}

/** The editor's values for a record (or a new one), as the controls hold them. */
export function catalogEditorDefaults(
  locale: Locale,
  kind: CatalogKindV1,
  entity: CatalogEntityV1 | undefined,
  requestId: string,
): CatalogEditorValues {
  return {
    locale,
    kind,
    entityId: entity?.id ?? "",
    expectedRevision: entity ? String(entity.revision) : "",
    requestId,
    name_en: entity?.name_en ?? "",
    name_ar: entity?.name_ar ?? "",
    description_en: entity?.description_en ?? "",
    description_ar: entity?.description_ar ?? "",
    key: entity?.metadata.key ?? "",
    retire: entity?.metadata.retire === true,
    sort_order: String(entity?.metadata.sort_order ?? 0),
    time_zone: entity?.metadata.time_zone ?? "America/New_York",
    address_en: entity?.address_en ?? "",
    address_ar: entity?.address_ar ?? "",
    currency: entity?.currency ?? "USD",
    price: catalogPriceInput(entity?.price_minor ?? 0),
    duration_minutes: String(entity?.duration_minutes ?? 30),
    buffer_before_minutes: String(entity?.buffer_before_minutes ?? 0),
    buffer_after_minutes: String(entity?.buffer_after_minutes ?? 0),
    tax_rate_bps: String(entity?.tax_rate_bps ?? 0),
    payment_mode: entity?.payment_mode ?? "none",
    booking_mode: entity?.booking_mode ?? "appointment",
    assignment_mode: entity?.metadata.assignment_mode ?? "any_available",
    approval_required: entity?.approval_required === true,
    category_id: entity?.metadata.category_id ?? CATALOG_NO_LINK,
    fixed_staff_id: entity?.metadata.fixed_staff_id ?? "",
    resource_type_id: entity?.metadata.resource_type_id ?? CATALOG_NO_LINK,
    location_ids: [...(entity?.metadata.location_ids ?? [])],
    consent_version:
      typeof entity?.policy.consent_version === "string"
        ? entity.policy.consent_version
        : "1",
    consent_en:
      typeof entity?.policy.consent_text === "string" ? entity.policy.consent_text : "",
    consent_ar:
      typeof entity?.policy_ar.consent_text === "string"
        ? entity.policy_ar.consent_text
        : "",
    deposit_percent_bps: String(
      typeof entity?.policy.deposit_percent_bps === "number"
        ? entity.policy.deposit_percent_bps
        : 5000,
    ),
    intake: intakeFields(entity),
  };
}

type EditorSchema = z.ZodType<CatalogEditorValues, CatalogEditorValues>;

export function CatalogForm({
  locale,
  kind,
  entity,
  workspace,
  requestId,
}: {
  locale: Locale;
  kind: CatalogKindV1;
  entity?: CatalogEntityV1;
  workspace: CatalogWorkspaceV1;
  requestId: string;
}) {
  const message = (key: CatalogMessageKey) => catalogMessage(locale, key);
  const messages = catalogErrorMessages(locale);
  const router = useRouter();
  const navigate = useResultNavigation();
  const full = workspace.canPublish;
  const defaults = catalogEditorDefaults(locale, kind, entity, requestId);
  // Operators without full catalog authority edit names and descriptions only.
  const form = useZodForm(
    (full ? catalogDraftSchema : catalogContentSchema) as unknown as EditorSchema,
    { defaultValues: defaults },
  );
  useAuthoritativeDefaults(form, defaults);
  const control = form.control;
  const questions = useFieldArray({ control, name: "intake" });
  const assignment = useWatch({ control, name: "assignment_mode" });
  const mutation = useActionMutation(saveCatalogDraftAction, {
    refresh: false,
    toast: dashboardToast(locale, { messages }),
    onFailure: (result) => applyActionErrors(form, result),
    onSuccess: (data) => navigate(data.destination),
  });
  const name = (row: CatalogEntityV1) => (locale === "ar" ? row.name_ar : row.name_en);
  const pending = mutation.isPending;
  return (
    <Form form={form} locale={locale} messages={messages}>
      <form
        noValidate
        className="grid gap-6"
        data-catalog-kind={kind}
        onSubmit={form.handleSubmit(() => mutation.mutate(form.getValues()))}
      >
        <MutationFeedback
          locale={locale}
          messages={messages}
          result={mutation.data?.ok === false ? mutation.data : undefined}
          transportFailed={mutation.isError}
          reload={{
            codes: ["revision_conflict"],
            label: message("reload"),
            onReload: () => router.refresh(),
          }}
        />
        <FieldSet disabled={pending} className={panel}>
          <FieldLegend>{message("content")}</FieldLegend>
          {full ? (
            <FieldGroup columns={2}>
              <TextField
                control={control}
                name="key"
                label={message("key")}
                required
                dir="ltr"
                maxLength={100}
              />
            </FieldGroup>
          ) : null}
          <FieldGroup columns={2}>
            <TextField
              control={control}
              name="name_en"
              label={message("nameEn")}
              required
              dir="ltr"
              maxLength={160}
            />
            <TextField
              control={control}
              name="name_ar"
              label={message("nameAr")}
              required
              dir="rtl"
              maxLength={160}
            />
            <TextField
              control={control}
              name="description_en"
              label={message("descriptionEn")}
              multiline
              dir="ltr"
              maxLength={2000}
            />
            <TextField
              control={control}
              name="description_ar"
              label={message("descriptionAr")}
              multiline
              dir="rtl"
              maxLength={2000}
            />
          </FieldGroup>
        </FieldSet>
        {full && kind === "category" ? (
          <FieldSet disabled={pending} className={panel}>
            <FieldGroup columns={2}>
              <TextField
                control={control}
                name="sort_order"
                type="number"
                label={message("sort")}
                required
                min={0}
                max={100000}
                step={1}
              />
            </FieldGroup>
          </FieldSet>
        ) : null}
        {full && kind === "location" ? (
          <FieldSet disabled={pending} className={panel}>
            <FieldLegend>{message("locations")}</FieldLegend>
            <FieldGroup columns={2}>
              <TextField
                control={control}
                name="time_zone"
                label={message("timeZone")}
                required
                dir="ltr"
                maxLength={100}
                description={message("timeZoneHint")}
              />
            </FieldGroup>
            <FieldGroup columns={2}>
              <TextField
                control={control}
                name="address_en"
                label={message("addressEn")}
                multiline
                dir="ltr"
                maxLength={2000}
              />
              <TextField
                control={control}
                name="address_ar"
                label={message("addressAr")}
                multiline
                dir="rtl"
                maxLength={2000}
              />
            </FieldGroup>
          </FieldSet>
        ) : null}
        {full && kind === "service" ? (
          <>
            <FieldSet disabled={pending} className={panel}>
              <FieldLegend>{message("scheduling")}</FieldLegend>
              <FieldGroup columns={3}>
                <TextField
                  control={control}
                  name="duration_minutes"
                  label={message("duration")}
                  required
                  type="number"
                  min={1}
                  max={1440}
                  step={1}
                />
                <TextField
                  control={control}
                  name="buffer_before_minutes"
                  label={message("before")}
                  required
                  type="number"
                  min={0}
                  max={1440}
                  step={1}
                />
                <TextField
                  control={control}
                  name="buffer_after_minutes"
                  label={message("after")}
                  required
                  type="number"
                  min={0}
                  max={1440}
                  step={1}
                />
              </FieldGroup>
              <FieldGroup columns={2}>
                <SelectField
                  control={control}
                  name="category_id"
                  label={message("category")}
                  options={[
                    { value: CATALOG_NO_LINK, label: message("noCategory") },
                    ...workspace.entities
                      .filter(
                        (row) => row.kind === "category" && row.state !== "retired",
                      )
                      .map((row) => ({ value: row.id, label: name(row) })),
                  ]}
                />
                <SelectField
                  control={control}
                  name="booking_mode"
                  label={message("bookingMode")}
                  options={(["appointment", "exclusive_resource"] as const).map(
                    (value) => ({ value, label: message(value) }),
                  )}
                />
                <SelectField
                  control={control}
                  name="assignment_mode"
                  label={message("assignment")}
                  options={(
                    [
                      "any_available",
                      "customer_choice",
                      "round_robin",
                      "fixed_staff",
                    ] as const
                  ).map((value) => ({ value, label: message(value) }))}
                />
                <SelectField
                  control={control}
                  name="fixed_staff_id"
                  label={message("fixedStaff")}
                  required={assignment === "fixed_staff"}
                  placeholder="—"
                  options={workspace.staff.map((staff) => ({
                    value: staff.id,
                    label: staff.name,
                  }))}
                />
                <SelectField
                  control={control}
                  name="resource_type_id"
                  label={message("resourceType")}
                  options={[
                    { value: CATALOG_NO_LINK, label: message("noResource") },
                    ...workspace.resourceTypes.map((type) => ({
                      value: type.id,
                      label: type.name,
                    })),
                  ]}
                />
              </FieldGroup>
              <CheckboxGroupField
                control={control}
                name="location_ids"
                idPrefix={`catalog-${entity?.id ?? "new"}-location`}
                label={message("chooseLocations")}
                options={workspace.entities
                  .filter((row) => row.kind === "location" && row.state !== "retired")
                  .map((row) => ({
                    value: row.id,
                    label: (
                      <>
                        {name(row)} ·{" "}
                        <bdi className="text-muted-foreground">
                          {row.metadata.time_zone}
                        </bdi>
                      </>
                    ),
                  }))}
              />
              <CheckboxField
                control={control}
                name="approval_required"
                label={message("approval")}
              />
            </FieldSet>
            <FieldSet disabled={pending} className={panel}>
              <FieldLegend>{message("financial")}</FieldLegend>
              <FieldGroup columns={2}>
                <TextField
                  control={control}
                  name="currency"
                  label={message("currency")}
                  required
                  dir="ltr"
                  maxLength={3}
                />
                <TextField
                  control={control}
                  name="price"
                  label={message("price")}
                  required
                  dir="ltr"
                  maxLength={30}
                  description={message("currencyHint")}
                />
                <TextField
                  control={control}
                  name="tax_rate_bps"
                  label={message("tax")}
                  required
                  type="number"
                  min={0}
                  max={3000}
                  step={1}
                />
                <SelectField
                  control={control}
                  name="payment_mode"
                  label={message("payment")}
                  options={(["none", "deposit", "full"] as const).map((value) => ({
                    value,
                    label: message(value),
                  }))}
                />
                <TextField
                  control={control}
                  name="deposit_percent_bps"
                  label={message("depositBps")}
                  required
                  type="number"
                  min={0}
                  max={10000}
                  step={1}
                />
              </FieldGroup>
            </FieldSet>
            <FieldSet disabled={pending} className={panel}>
              <FieldLegend>{message("legal")}</FieldLegend>
              <FieldGroup columns={2}>
                <TextField
                  control={control}
                  name="consent_version"
                  label={message("consentVersion")}
                  required
                  maxLength={40}
                />
              </FieldGroup>
              <FieldGroup columns={2}>
                <TextField
                  control={control}
                  name="consent_en"
                  label={message("consentEn")}
                  required
                  multiline
                  dir="ltr"
                  maxLength={10000}
                />
                <TextField
                  control={control}
                  name="consent_ar"
                  label={message("consentAr")}
                  required
                  multiline
                  dir="rtl"
                  maxLength={10000}
                />
              </FieldGroup>
              <div className="grid gap-4 border-t pt-5">
                <h3 className="text-base font-semibold">{message("intake")}</h3>
                {questions.fields.map((question, index) => (
                  <FieldSet
                    key={question.id}
                    className="gap-4 border-b pb-5 last-of-type:border-b-0"
                  >
                    <FieldLegend className="text-sm text-muted-foreground">
                      {message("question")} {formatNumber(index + 1, locale)}
                    </FieldLegend>
                    <FieldGroup columns={3}>
                      <TextField
                        control={control}
                        name={`intake.${index}.key`}
                        htmlName={`intake_key.${index}`}
                        label={message("intakeKey")}
                        required
                        maxLength={64}
                        dir="ltr"
                      />
                      <TextField
                        control={control}
                        name={`intake.${index}.en`}
                        htmlName={`intake_en.${index}`}
                        label={message("questionEn")}
                        required
                        maxLength={500}
                        dir="ltr"
                      />
                      <TextField
                        control={control}
                        name={`intake.${index}.ar`}
                        htmlName={`intake_ar.${index}`}
                        label={message("questionAr")}
                        required
                        maxLength={500}
                        dir="rtl"
                      />
                    </FieldGroup>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <CheckboxField
                        control={control}
                        name={`intake.${index}.required`}
                        htmlName={`intake_required.${index}`}
                        label={message("required")}
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        type="button"
                        onClick={() => questions.remove(index)}
                      >
                        <Trash2 aria-hidden="true" />
                        {message("removeQuestion")}
                      </Button>
                    </div>
                  </FieldSet>
                ))}
                <div>
                  <Button
                    variant="outline"
                    type="button"
                    disabled={questions.fields.length >= 20}
                    onClick={() =>
                      questions.append({
                        rowId: newAttemptId(),
                        key: "",
                        en: "",
                        ar: "",
                        required: false,
                      })
                    }
                  >
                    <Plus aria-hidden="true" />
                    {message("addQuestion")}
                  </Button>
                </div>
              </div>
            </FieldSet>
          </>
        ) : null}
        {full && entity ? (
          <FieldSet disabled={pending} className={panel}>
            <FieldLegend>{message("retire")}</FieldLegend>
            <CheckboxField
              control={control}
              name="retire"
              label={message("retire")}
              description={message("retireHint")}
            />
          </FieldSet>
        ) : null}
        <FormActions sticky>
          <Button type="submit" loading={pending} loadingLabel={message("working")}>
            {message("save")}
          </Button>
        </FormActions>
      </form>
    </Form>
  );
}

export function CatalogPublicationForm({
  locale,
  workspace,
  requestId,
}: {
  locale: Locale;
  workspace: CatalogWorkspaceV1;
  requestId: string;
}) {
  const [nextAttempt, setNextAttempt] = useState<string | null>(null);
  const message = (key: CatalogMessageKey) => catalogMessage(locale, key);
  const messages = catalogErrorMessages(locale);
  const mutation = useActionMutation(publishCatalogAction, {
    toast: dashboardToast(locale, { messages, success: message("published") }),
    onSuccess: () => setNextAttempt(newAttemptId()),
  });
  const drafts = workspace.entities.filter((row) => row.state === "draft");
  const published = mutation.data?.ok === true;
  if (!workspace.canPublish) return null;
  if (!drafts.length)
    return published ? (
      <MutationFeedback
        locale={locale}
        messages={messages}
        result={mutation.data}
        transportFailed={false}
        success={message("published")}
      />
    ) : null;
  return (
    <Section
      id="publish"
      title={message("publish")}
      description={message("publishHint")}
    >
      <ul className="grid divide-y rounded-lg border bg-card">
        {drafts.map((draft) => (
          <li
            key={draft.id}
            className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3 text-sm"
          >
            <Link
              className="font-semibold text-primary underline-offset-4 hover:underline"
              href={`/${locale}/${draft.kind === "service" ? "services" : draft.kind === "category" ? "categories" : "locations"}/${draft.id}`}
            >
              {locale === "ar" ? draft.name_ar : draft.name_en}
            </Link>
            <span className="flex flex-wrap items-center gap-2 text-muted-foreground">
              <StatusStamp state="pending">{message("draft")}</StatusStamp>
              <span>
                {message("revision")} {formatNumber(draft.revision, locale)}
              </span>
              {draft.metadata.retire ? (
                <StatusStamp state="cancelled">
                  {message("pendingRetirement")}
                </StatusStamp>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
      <div className="grid gap-4">
        <MutationFeedback
          locale={locale}
          messages={messages}
          result={mutation.data}
          transportFailed={mutation.isError}
          success={message("published")}
        />
        <FormActions>
          <ConfirmAction
            label={message("publish")}
            pending={mutation.isPending}
            pendingLabel={message("working")}
            title={message("publishConfirmTitle")}
            description={message("confirmPublish")}
            confirmLabel={message("publishConfirmAction")}
            cancelLabel={message("cancel")}
            onConfirm={() =>
              mutation.mutate({
                locale,
                requestId: nextAttempt ?? requestId,
                confirm: "yes",
                // The reviewed draft revisions, exactly as listed above.
                revisions: Object.fromEntries(
                  drafts.map((row) => [row.id, row.revision]),
                ),
              })
            }
          />
        </FormActions>
      </div>
    </Section>
  );
}
