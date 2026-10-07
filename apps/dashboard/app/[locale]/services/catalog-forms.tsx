"use client";
import { CATALOG_NO_LINK, catalogPriceInput } from "./catalog-fields";
import { useActionState, useEffect, useId, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, RotateCw, Trash2 } from "lucide-react";
import type {
  CatalogEntityV1,
  CatalogKindV1,
  CatalogWorkspaceV1,
} from "@wlbp/api-contracts";
import { formatNumber, type Locale } from "@wlbp/i18n";
import {
  Alert,
  AlertDescription,
  Button,
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
  Textarea,
} from "@wlbp/ui-foundation";
import { catalogMessage, type CatalogMessageKey } from "./catalog-copy";
import { saveCatalogDraftAction, publishCatalogAction } from "./actions";
import { ConfirmSubmit } from "./confirm-submit";
import { CheckboxRow, ChoiceSelect, FormActions, keepUnsavedInput } from "./form-kit";

const panel = "grid gap-5 rounded-lg border bg-card p-5 md:p-6";

function TextInputField({
  name,
  label,
  value,
  dir,
  type = "text",
  maxLength,
  min,
  max,
  required = true,
  description,
  className,
}: {
  name: string;
  label: string;
  value?: string | number | undefined;
  dir?: "ltr" | "rtl";
  type?: string;
  maxLength?: number;
  min?: number;
  max?: number;
  required?: boolean;
  description?: string;
  className?: string;
}) {
  const id = useId();
  const descriptionId = description ? `${id}-description` : undefined;
  return (
    <Field {...(className ? { className } : {})}>
      <Label htmlFor={id}>
        {label}
        {required ? <RequiredMark /> : null}
      </Label>
      {type === "textarea" ? (
        <Textarea
          id={id}
          name={name}
          defaultValue={value ?? ""}
          required={required}
          maxLength={maxLength}
          dir={dir}
          rows={3}
          aria-describedby={descriptionId}
        />
      ) : (
        <Input
          id={id}
          name={name}
          type={type}
          defaultValue={value ?? ""}
          required={required}
          maxLength={maxLength}
          dir={dir}
          min={min}
          max={max}
          step={type === "number" ? 1 : undefined}
          aria-describedby={descriptionId}
        />
      )}
      {description ? (
        <FieldDescription id={descriptionId}>{description}</FieldDescription>
      ) : null}
    </Field>
  );
}
function intakeFields(entity?: CatalogEntityV1) {
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
  const router = useRouter();
  const id = useId();
  const [state, action, pending] = useActionState(saveCatalogDraftAction, {});
  const attempt = state.nextRequestId ?? requestId;
  const [questions, setQuestions] = useState(() => intakeFields(entity));
  const [assignment, setAssignment] = useState(
    entity?.metadata.assignment_mode ?? "any_available",
  );
  const [payment, setPayment] = useState(entity?.payment_mode ?? "none");
  useEffect(() => {
    if (state.saved) {
      if (
        state.destination &&
        `${window.location.pathname}${window.location.search}` !== state.destination
      )
        router.replace(state.destination);
      else router.refresh();
    }
  }, [state, router]);
  const full = workspace.canPublish;
  const name = (row: CatalogEntityV1) => (locale === "ar" ? row.name_ar : row.name_en);
  return (
    <form action={action} className="grid gap-6" {...keepUnsavedInput}>
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="entityId" value={entity?.id ?? ""} />
      <input type="hidden" name="expectedRevision" value={entity?.revision ?? ""} />
      <input type="hidden" name="requestId" value={attempt} />
      {state.message ? (
        <Alert tone={state.saved ? "positive" : "danger"}>
          <AlertDescription className="flex flex-wrap items-center gap-3 text-foreground">
            <span>{message(state.message)}</span>
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
      <FieldSet disabled={pending} className={panel}>
        <FieldLegend>{message("content")}</FieldLegend>
        {full ? (
          <FieldGroup columns={2}>
            <TextInputField
              name="key"
              label={message("key")}
              value={entity?.metadata.key}
              dir="ltr"
              maxLength={100}
            />
          </FieldGroup>
        ) : null}
        <FieldGroup columns={2}>
          <TextInputField
            name="name_en"
            label={message("nameEn")}
            value={entity?.name_en}
            dir="ltr"
            maxLength={160}
          />
          <TextInputField
            name="name_ar"
            label={message("nameAr")}
            value={entity?.name_ar}
            dir="rtl"
            maxLength={160}
          />
          <TextInputField
            name="description_en"
            label={message("descriptionEn")}
            value={entity?.description_en}
            type="textarea"
            dir="ltr"
            required={false}
            maxLength={2000}
          />
          <TextInputField
            name="description_ar"
            label={message("descriptionAr")}
            value={entity?.description_ar}
            type="textarea"
            dir="rtl"
            required={false}
            maxLength={2000}
          />
        </FieldGroup>
      </FieldSet>
      {full && kind === "category" ? (
        <FieldSet disabled={pending} className={panel}>
          <FieldGroup columns={2}>
            <TextInputField
              name="sort_order"
              type="number"
              label={message("sort")}
              value={entity?.metadata.sort_order ?? 0}
              min={0}
              max={100000}
            />
          </FieldGroup>
        </FieldSet>
      ) : null}
      {full && kind === "location" ? (
        <FieldSet disabled={pending} className={panel}>
          <FieldLegend>{message("locations")}</FieldLegend>
          <FieldGroup columns={2}>
            <TextInputField
              name="time_zone"
              label={message("timeZone")}
              value={entity?.metadata.time_zone ?? "America/New_York"}
              dir="ltr"
              maxLength={100}
              description={message("timeZoneHint")}
            />
          </FieldGroup>
          <FieldGroup columns={2}>
            <TextInputField
              name="address_en"
              label={message("addressEn")}
              value={entity?.address_en}
              type="textarea"
              dir="ltr"
              required={false}
              maxLength={2000}
            />
            <TextInputField
              name="address_ar"
              label={message("addressAr")}
              value={entity?.address_ar}
              type="textarea"
              dir="rtl"
              required={false}
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
              <TextInputField
                name="duration_minutes"
                label={message("duration")}
                value={entity?.duration_minutes ?? 30}
                type="number"
                min={1}
                max={1440}
              />
              <TextInputField
                name="buffer_before_minutes"
                label={message("before")}
                value={entity?.buffer_before_minutes ?? 0}
                type="number"
                min={0}
                max={1440}
              />
              <TextInputField
                name="buffer_after_minutes"
                label={message("after")}
                value={entity?.buffer_after_minutes ?? 0}
                type="number"
                min={0}
                max={1440}
              />
            </FieldGroup>
            <FieldGroup columns={2}>
              <Field>
                <Label htmlFor={`${id}-category`}>{message("category")}</Label>
                <ChoiceSelect
                  id={`${id}-category`}
                  name="category_id"
                  defaultValue={entity?.metadata.category_id ?? CATALOG_NO_LINK}
                  options={[
                    { value: CATALOG_NO_LINK, label: message("noCategory") },
                    ...workspace.entities
                      .filter(
                        (row) => row.kind === "category" && row.state !== "retired",
                      )
                      .map((row) => ({ value: row.id, label: name(row) })),
                  ]}
                />
              </Field>
              <Field>
                <Label htmlFor={`${id}-booking-mode`}>{message("bookingMode")}</Label>
                <ChoiceSelect
                  id={`${id}-booking-mode`}
                  name="booking_mode"
                  defaultValue={entity?.booking_mode ?? "appointment"}
                  options={(["appointment", "exclusive_resource"] as const).map(
                    (value) => ({ value, label: message(value) }),
                  )}
                />
              </Field>
              <Field>
                <Label htmlFor={`${id}-assignment`}>{message("assignment")}</Label>
                <ChoiceSelect
                  id={`${id}-assignment`}
                  name="assignment_mode"
                  value={assignment}
                  onValueChange={(value) => setAssignment(value as typeof assignment)}
                  options={(
                    [
                      "any_available",
                      "customer_choice",
                      "round_robin",
                      "fixed_staff",
                    ] as const
                  ).map((value) => ({ value, label: message(value) }))}
                />
              </Field>
              <Field>
                <Label htmlFor={`${id}-fixed-staff`}>
                  {message("fixedStaff")}
                  {assignment === "fixed_staff" ? <RequiredMark /> : null}
                </Label>
                <ChoiceSelect
                  id={`${id}-fixed-staff`}
                  name="fixed_staff_id"
                  required={assignment === "fixed_staff"}
                  defaultValue={entity?.metadata.fixed_staff_id ?? ""}
                  placeholder="—"
                  options={workspace.staff.map((staff) => ({
                    value: staff.id,
                    label: staff.name,
                  }))}
                />
              </Field>
              <Field>
                <Label htmlFor={`${id}-resource-type`}>{message("resourceType")}</Label>
                <ChoiceSelect
                  id={`${id}-resource-type`}
                  name="resource_type_id"
                  defaultValue={entity?.metadata.resource_type_id ?? CATALOG_NO_LINK}
                  options={[
                    { value: CATALOG_NO_LINK, label: message("noResource") },
                    ...workspace.resourceTypes.map((type) => ({
                      value: type.id,
                      label: type.name,
                    })),
                  ]}
                />
              </Field>
            </FieldGroup>
            <FieldSet className="gap-1">
              <FieldLegend className="text-sm">
                {message("chooseLocations")}
              </FieldLegend>
              <div className="grid gap-x-6 md:grid-cols-2">
                {workspace.entities
                  .filter((row) => row.kind === "location" && row.state !== "retired")
                  .map((row) => (
                    <CheckboxRow
                      key={row.id}
                      id={`${id}-location-${row.id}`}
                      name="location_ids"
                      value={row.id}
                      defaultChecked={entity?.metadata.location_ids?.includes(row.id)}
                    >
                      {name(row)} ·{" "}
                      <bdi className="text-muted-foreground">
                        {row.metadata.time_zone}
                      </bdi>
                    </CheckboxRow>
                  ))}
              </div>
            </FieldSet>
            <CheckboxRow
              id={`${id}-approval`}
              name="approval_required"
              defaultChecked={entity?.approval_required}
            >
              {message("approval")}
            </CheckboxRow>
          </FieldSet>
          <FieldSet disabled={pending} className={panel}>
            <FieldLegend>{message("financial")}</FieldLegend>
            <FieldGroup columns={2}>
              <TextInputField
                name="currency"
                label={message("currency")}
                value={entity?.currency ?? "USD"}
                dir="ltr"
                maxLength={3}
              />
              <TextInputField
                name="price"
                label={message("price")}
                value={catalogPriceInput(entity?.price_minor ?? 0)}
                dir="ltr"
                maxLength={30}
                description={message("currencyHint")}
              />
              <TextInputField
                name="tax_rate_bps"
                label={message("tax")}
                value={entity?.tax_rate_bps ?? 0}
                type="number"
                min={0}
                max={3000}
              />
              <Field>
                <Label htmlFor={`${id}-payment`}>{message("payment")}</Label>
                <ChoiceSelect
                  id={`${id}-payment`}
                  name="payment_mode"
                  value={payment}
                  onValueChange={(value) => setPayment(value as typeof payment)}
                  options={(["none", "deposit", "full"] as const).map((value) => ({
                    value,
                    label: message(value),
                  }))}
                />
              </Field>
              <TextInputField
                name="deposit_percent_bps"
                label={message("depositBps")}
                value={
                  typeof entity?.policy.deposit_percent_bps === "number"
                    ? entity.policy.deposit_percent_bps
                    : 5000
                }
                type="number"
                min={0}
                max={10000}
              />
            </FieldGroup>
          </FieldSet>
          <FieldSet disabled={pending} className={panel}>
            <FieldLegend>{message("legal")}</FieldLegend>
            <FieldGroup columns={2}>
              <TextInputField
                name="consent_version"
                label={message("consentVersion")}
                value={
                  typeof entity?.policy.consent_version === "string"
                    ? entity.policy.consent_version
                    : "1"
                }
                maxLength={40}
              />
            </FieldGroup>
            <FieldGroup columns={2}>
              <TextInputField
                name="consent_en"
                label={message("consentEn")}
                value={
                  typeof entity?.policy.consent_text === "string"
                    ? entity.policy.consent_text
                    : ""
                }
                type="textarea"
                dir="ltr"
                maxLength={10000}
              />
              <TextInputField
                name="consent_ar"
                label={message("consentAr")}
                value={
                  typeof entity?.policy_ar.consent_text === "string"
                    ? entity.policy_ar.consent_text
                    : ""
                }
                type="textarea"
                dir="rtl"
                maxLength={10000}
              />
            </FieldGroup>
            <div className="grid gap-4 border-t pt-5">
              <h3 className="text-base font-semibold">{message("intake")}</h3>
              <input type="hidden" name="intake_count" value={questions.length} />
              {questions.map((question, index) => (
                <FieldSet
                  key={question.rowId}
                  className="gap-4 border-b pb-5 last-of-type:border-b-0"
                >
                  <FieldLegend className="text-sm text-muted-foreground">
                    {message("question")} {formatNumber(index + 1, locale)}
                  </FieldLegend>
                  <FieldGroup columns={3}>
                    <TextInputField
                      name={`intake_key.${index}`}
                      label={message("intakeKey")}
                      value={question.key}
                      maxLength={64}
                      dir="ltr"
                    />
                    <TextInputField
                      name={`intake_en.${index}`}
                      label={message("questionEn")}
                      value={question.en}
                      maxLength={500}
                      dir="ltr"
                    />
                    <TextInputField
                      name={`intake_ar.${index}`}
                      label={message("questionAr")}
                      value={question.ar}
                      maxLength={500}
                      dir="rtl"
                    />
                  </FieldGroup>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <CheckboxRow
                      id={`${id}-intake-required-${question.rowId}`}
                      name={`intake_required.${index}`}
                      defaultChecked={question.required}
                    >
                      {message("required")}
                    </CheckboxRow>
                    <Button
                      variant="ghost"
                      size="sm"
                      type="button"
                      onClick={() =>
                        setQuestions((items) => items.filter((_, row) => row !== index))
                      }
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
                  disabled={questions.length >= 20}
                  onClick={() =>
                    setQuestions((items) => [
                      ...items,
                      {
                        rowId: crypto.randomUUID(),
                        key: "",
                        en: "",
                        ar: "",
                        required: false,
                      },
                    ])
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
          <CheckboxRow
            id={`${id}-retire`}
            name="retire"
            defaultChecked={entity.metadata.retire}
            description={message("retireHint")}
          >
            {message("retire")}
          </CheckboxRow>
        </FieldSet>
      ) : null}
      <FormActions sticky>
        <Button type="submit" loading={pending} loadingLabel={message("working")}>
          {message("save")}
        </Button>
      </FormActions>
    </form>
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
  const [state, action, pending] = useActionState(publishCatalogAction, {});
  const attempt = state.nextRequestId ?? requestId;
  const router = useRouter();
  useEffect(() => {
    if (state.saved) {
      router.refresh();
    }
  }, [state, router]);
  const message = (key: CatalogMessageKey) => catalogMessage(locale, key);
  const drafts = workspace.entities.filter((row) => row.state === "draft");
  if (!workspace.canPublish) return null;
  if (!drafts.length)
    return state.saved && state.message ? (
      <Alert tone="positive">
        <AlertDescription className="text-foreground">
          {message(state.message)}
        </AlertDescription>
      </Alert>
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
      <form action={action} className="grid gap-4">
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="requestId" value={attempt} />
        <input
          type="hidden"
          name="manifest"
          value={JSON.stringify(
            Object.fromEntries(drafts.map((row) => [row.id, row.revision])),
          )}
        />
        {state.message ? (
          <Alert tone={state.saved ? "positive" : "danger"}>
            <AlertDescription className="text-foreground">
              {message(state.message)}
            </AlertDescription>
          </Alert>
        ) : null}
        <FormActions>
          <ConfirmSubmit
            label={message("publish")}
            pending={pending}
            pendingLabel={message("working")}
            title={message("publishConfirmTitle")}
            description={message("confirmPublish")}
            confirmLabel={message("publishConfirmAction")}
            cancelLabel={message("cancel")}
          />
        </FormActions>
      </form>
    </Section>
  );
}
