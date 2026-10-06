"use client";
import { catalogPriceInput } from "./catalog-fields";
import { useActionState, useEffect, useId, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type {
  CatalogEntityV1,
  CatalogKindV1,
  CatalogWorkspaceV1,
} from "@wlbp/api-contracts";
import type { Locale } from "@wlbp/i18n";
import { catalogMessage, type CatalogMessageKey } from "./catalog-copy";
import { saveCatalogDraftAction, publishCatalogAction } from "./actions";

function Field({
  name,
  label,
  value,
  dir,
  type = "text",
  maxLength,
  min,
  max,
  required = true,
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
}) {
  const id = useId();
  return (
    <label className="team-resource-field" htmlFor={id}>
      <span>{label}</span>
      {type === "textarea" ? (
        <textarea
          className="wlbp-field__input"
          id={id}
          name={name}
          defaultValue={value ?? ""}
          required={required}
          maxLength={maxLength}
          dir={dir}
          rows={3}
        />
      ) : (
        <input
          className="wlbp-field__input"
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
        />
      )}
    </label>
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
  return (
    <form
      action={action}
      className="catalog-form"
      onReset={(event) => event.preventDefault()}
    >
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="entityId" value={entity?.id ?? ""} />
      <input type="hidden" name="expectedRevision" value={entity?.revision ?? ""} />
      <input type="hidden" name="requestId" value={attempt} />
      {state.message ? (
        <p role={state.saved ? "status" : "alert"}>
          {message(state.message)}
          {state.message === "revision_conflict" ? (
            <>
              {" "}
              <button
                className="wlbp-button wlbp-button--quiet"
                type="button"
                onClick={() => router.refresh()}
              >
                {message("reload")}
              </button>
            </>
          ) : null}
        </p>
      ) : null}
      <fieldset disabled={pending}>
        <legend>{message("content")}</legend>
        {full ? (
          <Field
            name="key"
            label={message("key")}
            value={entity?.metadata.key}
            dir="ltr"
            maxLength={100}
          />
        ) : null}
        <div className="catalog-field-columns">
          <Field
            name="name_en"
            label={message("nameEn")}
            value={entity?.name_en}
            dir="ltr"
            maxLength={160}
          />
          <Field
            name="name_ar"
            label={message("nameAr")}
            value={entity?.name_ar}
            dir="rtl"
            maxLength={160}
          />
          <Field
            name="description_en"
            label={message("descriptionEn")}
            value={entity?.description_en}
            type="textarea"
            dir="ltr"
            required={false}
            maxLength={2000}
          />
          <Field
            name="description_ar"
            label={message("descriptionAr")}
            value={entity?.description_ar}
            type="textarea"
            dir="rtl"
            required={false}
            maxLength={2000}
          />
        </div>
      </fieldset>
      {full && kind === "category" ? (
        <fieldset disabled={pending}>
          <Field
            name="sort_order"
            type="number"
            label={message("sort")}
            value={entity?.metadata.sort_order ?? 0}
            min={0}
            max={100000}
          />
        </fieldset>
      ) : null}
      {full && kind === "location" ? (
        <fieldset disabled={pending}>
          <legend>{message("locations")}</legend>
          <Field
            name="time_zone"
            label={message("timeZone")}
            value={entity?.metadata.time_zone ?? "America/New_York"}
            dir="ltr"
            maxLength={100}
          />
          <p>{message("timeZoneHint")}</p>
          <Field
            name="address_en"
            label={message("addressEn")}
            value={entity?.address_en}
            type="textarea"
            dir="ltr"
            required={false}
            maxLength={2000}
          />
          <Field
            name="address_ar"
            label={message("addressAr")}
            value={entity?.address_ar}
            type="textarea"
            dir="rtl"
            required={false}
            maxLength={2000}
          />
        </fieldset>
      ) : null}
      {full && kind === "service" ? (
        <>
          <fieldset disabled={pending}>
            <legend>{message("scheduling")}</legend>
            <div className="catalog-field-columns">
              <Field
                name="duration_minutes"
                label={message("duration")}
                value={entity?.duration_minutes ?? 30}
                type="number"
                min={1}
                max={1440}
              />
              <Field
                name="buffer_before_minutes"
                label={message("before")}
                value={entity?.buffer_before_minutes ?? 0}
                type="number"
                min={0}
                max={1440}
              />
              <Field
                name="buffer_after_minutes"
                label={message("after")}
                value={entity?.buffer_after_minutes ?? 0}
                type="number"
                min={0}
                max={1440}
              />
            </div>
            <label>
              {message("category")}
              <select
                className="wlbp-field__input"
                name="category_id"
                defaultValue={entity?.metadata.category_id ?? ""}
              >
                <option value="">{message("noCategory")}</option>
                {workspace.entities
                  .filter((row) => row.kind === "category" && row.state !== "retired")
                  .map((row) => (
                    <option key={row.id} value={row.id}>
                      {locale === "ar" ? row.name_ar : row.name_en}
                    </option>
                  ))}
              </select>
            </label>
            <fieldset>
              <legend>{message("chooseLocations")}</legend>
              {workspace.entities
                .filter((row) => row.kind === "location" && row.state !== "retired")
                .map((row) => (
                  <label className="workspace-checkbox" key={row.id}>
                    <input
                      type="checkbox"
                      name="location_ids"
                      value={row.id}
                      defaultChecked={entity?.metadata.location_ids?.includes(row.id)}
                    />
                    {locale === "ar" ? row.name_ar : row.name_en} ·{" "}
                    <bdi>{row.metadata.time_zone}</bdi>
                  </label>
                ))}
            </fieldset>
            <label>
              {message("bookingMode")}
              <select
                className="wlbp-field__input"
                name="booking_mode"
                defaultValue={entity?.booking_mode ?? "appointment"}
              >
                {(["appointment", "exclusive_resource"] as const).map((value) => (
                  <option key={value} value={value}>
                    {message(value)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {message("assignment")}
              <select
                className="wlbp-field__input"
                name="assignment_mode"
                value={assignment}
                onChange={(event) =>
                  setAssignment(event.target.value as typeof assignment)
                }
              >
                {(
                  [
                    "any_available",
                    "customer_choice",
                    "round_robin",
                    "fixed_staff",
                  ] as const
                ).map((value) => (
                  <option key={value} value={value}>
                    {message(value)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {message("fixedStaff")}
              <select
                className="wlbp-field__input"
                name="fixed_staff_id"
                required={assignment === "fixed_staff"}
                defaultValue={entity?.metadata.fixed_staff_id ?? ""}
              >
                <option value="">—</option>
                {workspace.staff.map((staff) => (
                  <option key={staff.id} value={staff.id}>
                    {staff.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {message("resourceType")}
              <select
                className="wlbp-field__input"
                name="resource_type_id"
                defaultValue={entity?.metadata.resource_type_id ?? ""}
              >
                <option value="">{message("noResource")}</option>
                {workspace.resourceTypes.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="workspace-checkbox">
              <input
                type="checkbox"
                name="approval_required"
                value="yes"
                defaultChecked={entity?.approval_required}
              />
              {message("approval")}
            </label>
          </fieldset>
          <fieldset disabled={pending}>
            <legend>{message("financial")}</legend>
            <Field
              name="currency"
              label={message("currency")}
              value={entity?.currency ?? "USD"}
              dir="ltr"
              maxLength={3}
            />
            <Field
              name="price"
              label={message("price")}
              value={catalogPriceInput(entity?.price_minor ?? 0)}
              dir="ltr"
              maxLength={30}
            />
            <p>{message("currencyHint")}</p>
            <Field
              name="tax_rate_bps"
              label={message("tax")}
              value={entity?.tax_rate_bps ?? 0}
              type="number"
              min={0}
              max={3000}
            />
            <label>
              {message("payment")}
              <select
                className="wlbp-field__input"
                name="payment_mode"
                value={payment}
                onChange={(event) => setPayment(event.target.value as typeof payment)}
              >
                {(["none", "deposit", "full"] as const).map((value) => (
                  <option key={value} value={value}>
                    {message(value)}
                  </option>
                ))}
              </select>
            </label>
            <Field
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
          </fieldset>
          <fieldset disabled={pending}>
            <legend>{message("legal")}</legend>
            <Field
              name="consent_version"
              label={message("consentVersion")}
              value={
                typeof entity?.policy.consent_version === "string"
                  ? entity.policy.consent_version
                  : "1"
              }
              maxLength={40}
            />
            <Field
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
            <Field
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
            <h3>{message("intake")}</h3>
            <input type="hidden" name="intake_count" value={questions.length} />
            {questions.map((question, index) => (
              <fieldset key={question.rowId}>
                <Field
                  name={`intake_key.${index}`}
                  label={message("intakeKey")}
                  value={question.key}
                  maxLength={64}
                  dir="ltr"
                />
                <Field
                  name={`intake_en.${index}`}
                  label={message("questionEn")}
                  value={question.en}
                  maxLength={500}
                  dir="ltr"
                />
                <Field
                  name={`intake_ar.${index}`}
                  label={message("questionAr")}
                  value={question.ar}
                  maxLength={500}
                  dir="rtl"
                />
                <label className="workspace-checkbox">
                  <input
                    type="checkbox"
                    name={`intake_required.${index}`}
                    value="yes"
                    defaultChecked={question.required}
                  />
                  {message("required")}
                </label>
                <button
                  className="wlbp-button wlbp-button--quiet"
                  type="button"
                  onClick={() =>
                    setQuestions((items) => items.filter((_, row) => row !== index))
                  }
                >
                  {message("removeQuestion")}
                </button>
              </fieldset>
            ))}
            <button
              className="wlbp-button wlbp-button--quiet"
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
              {message("addQuestion")}
            </button>
          </fieldset>
        </>
      ) : null}
      {full && entity ? (
        <fieldset disabled={pending}>
          <legend>{message("retire")}</legend>
          <p>{message("retireHint")}</p>
          <label className="workspace-checkbox">
            <input
              type="checkbox"
              name="retire"
              value="yes"
              defaultChecked={entity.metadata.retire}
            />
            {message("retire")}
          </label>
        </fieldset>
      ) : null}
      <button className="wlbp-button" disabled={pending}>
        {message(pending ? "working" : "save")}
      </button>
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
      <p role="status">{message(state.message)}</p>
    ) : null;
  return (
    <section className="workspace-section" aria-labelledby="publish-title">
      <h2 id="publish-title">{message("publish")}</h2>
      <p>{message("publishHint")}</p>
      <ul>
        {drafts.map((draft) => (
          <li key={draft.id}>
            <Link
              href={`/${locale}/${draft.kind === "service" ? "services" : draft.kind === "category" ? "categories" : "locations"}/${draft.id}`}
            >
              {locale === "ar" ? draft.name_ar : draft.name_en}
            </Link>{" "}
            · {message("revision")} {draft.revision}
            {draft.metadata.retire ? ` · ${message("pendingRetirement")}` : ""}
          </li>
        ))}
      </ul>
      <form action={action} className="auth-form">
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
          <p role={state.saved ? "status" : "alert"}>{message(state.message)}</p>
        ) : null}
        <label className="workspace-checkbox">
          <input
            type="checkbox"
            name="confirm"
            value="yes"
            required
            disabled={pending}
          />
          {message("confirmPublish")}
        </label>
        <button className="wlbp-button" disabled={pending}>
          {message(pending ? "working" : "publish")}
        </button>
      </form>
    </section>
  );
}
