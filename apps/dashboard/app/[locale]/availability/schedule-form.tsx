"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useWatch, type Path } from "react-hook-form";
import type { Locale } from "@wlbp/i18n";
import {
  Button,
  FieldGroup,
  FieldLegend,
  FieldSet,
  Form,
  applyActionErrors,
  useActionMutation,
  useZodForm,
} from "@wlbp/ui-foundation";
import { workspaceMessage } from "../../_lib/workspace-copy";
import type { ScheduleChoice } from "../../_lib/dashboard-access";
import { dashboardFormMessages } from "../../_lib/form-messages";
import { removeScheduleAction, saveScheduleAction } from "./actions";
import { ConfirmAction } from "../services/confirm-submit";
import { FormActions } from "../services/form-kit";
import type { ChoiceOption } from "../services/choice-select";
import {
  CheckboxField,
  DateField,
  DateTimeField,
  SelectField,
  TextField,
  TimeField,
} from "../services/form-fields";
import { newAttemptId, useAuthoritativeDefaults } from "../services/form-hooks";
import { MutationFeedback } from "../services/mutation-feedback";
import {
  UNAMBIGUOUS_FOLD,
  policyBounds,
  scheduleKinds,
  scheduleRuleSchema,
  type ScheduleKind,
  type ScheduleRuleInput,
} from "./schedule-schema";
import { scheduleMessage, type ScheduleMessage } from "./schedule-copy";
import { scopeName, type RecordRow } from "./schedule-scope";

const errorKeys = [
  "invalid",
  "gap",
  "foldError",
  "stale",
  "unavailable",
  "denied",
  "scopeNotEmpty",
  "breakOutside",
] as const satisfies readonly ScheduleMessage[];

function scheduleErrorMessages(locale: Locale): Readonly<Record<string, string>> {
  return {
    ...dashboardFormMessages(locale),
    ...Object.fromEntries(errorKeys.map((key) => [key, scheduleMessage(locale, key)])),
  };
}

function localValue(instant: string | null, timeZone: string): string {
  if (!instant) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(instant));
  const get = (kind: string) => parts.find((p) => p.type === kind)?.value;
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}
function timeValue(minute: number | null) {
  return minute === null
    ? ""
    : `${String(Math.floor(minute / 60) % 24).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
}
const recurringKinds: readonly ScheduleKind[] = ["weekly", "break", "exception"];
const timedKinds: readonly ScheduleKind[] = ["time_off", "blackout", "maintenance"];

/** The scope kinds a rule type may target. */
function scopeKindsFor(operation: ScheduleKind): readonly string[] {
  return operation === "policy"
    ? ["tenant", "location", "service", "staff", "resource"]
    : operation === "time_off"
      ? ["staff", "resource"]
      : operation === "maintenance"
        ? ["resource"]
        : operation === "scope"
          ? ["location", "staff", "resource"]
          : ["location"];
}

/** The editor's values for a rule (or a new one), as the controls hold them. */
export function scheduleDefaults(
  locale: Locale,
  choices: readonly ScheduleChoice[],
  rows: readonly RecordRow[],
  record: RecordRow | undefined,
  requestId: string,
): ScheduleRuleInput {
  const operation = record?.kind ?? "weekly";
  const scopes = rows.filter((row) => row.kind === "scope");
  const scopeId =
    record?.kind === "scope" ? record.id : (record?.scopeId ?? scopes[0]?.id ?? "");
  const scope = scopes.find((row) => row.id === scopeId);
  const locationId =
    record?.locationId ??
    scope?.locationId ??
    choices.find((c) => c.kind === "location")?.id ??
    "";
  const recurring = recurringKinds.includes(operation);
  const zone =
    (recurring ? scope?.timeZone : null) ??
    choices.find((c) => c.id === locationId)?.timeZone ??
    record?.timeZone ??
    "Asia/Riyadh";
  const fold =
    record?.fold === null || record?.fold === undefined
      ? UNAMBIGUOUS_FOLD
      : String(record.fold);
  return {
    locale,
    operation,
    requestId,
    id: record?.id ?? "",
    scopeId,
    locationId,
    staffId: record?.staffId ?? "",
    resourceId: record?.resourceId ?? "",
    serviceId: record?.serviceId ?? "",
    expectedRevision: recurring
      ? String(scope?.revision ?? "")
      : String(record?.revision ?? ""),
    scopeKind: record?.serviceId
      ? "service"
      : record?.staffId
        ? "staff"
        : record?.resourceId
          ? "resource"
          : "location",
    timeZone: zone,
    dayOfWeek: String(record?.dayOfWeek ?? 1),
    localDate: record?.localDate ?? "",
    exceptionKind: record?.exceptionKind ?? "closed",
    fold,
    startTime: timeValue(record?.startMinute ?? 540),
    endTime: timeValue(record?.endMinute ?? 1020),
    endOfDay: record?.endMinute === 1440,
    startsAt: localValue(record?.startsAt ?? null, zone),
    startFold: fold,
    endsAt: localValue(record?.endsAt ?? null, zone),
    endFold: fold,
    reason: record?.reason ?? "",
    policyKey: record?.policyKey ?? "minimum_notice_minutes",
    value:
      record?.value === null || record?.value === undefined ? "" : String(record.value),
  };
}

export function ScheduleForm({
  locale,
  choices,
  rows,
  record,
  attempt,
}: {
  locale: Locale;
  choices: readonly ScheduleChoice[];
  rows: readonly RecordRow[];
  record?: RecordRow;
  attempt: string;
}) {
  const message = (key: ScheduleMessage) => scheduleMessage(locale, key);
  const messages = scheduleErrorMessages(locale);
  const router = useRouter();
  const defaults = scheduleDefaults(locale, choices, rows, record, attempt);
  const form = useZodForm(scheduleRuleSchema, { defaultValues: defaults });
  useAuthoritativeDefaults(form, defaults);
  const control = form.control;
  const mutation = useActionMutation(saveScheduleAction, {
    onFailure: (result) => applyActionErrors(form, result),
  });
  const pending = mutation.isPending;
  const [operation, scopeId, scopeKind, locationId, exceptionKind] = useWatch({
    control,
    name: ["operation", "scopeId", "scopeKind", "locationId", "exceptionKind"],
  }) as [ScheduleKind, string, string, string, string];
  const scopes = rows.filter((row) => row.kind === "scope");
  const recurring = recurringKinds.includes(operation);
  const timed = timedKinds.includes(operation);
  const scope = scopes.find((row) => row.id === scopeId);
  const zone =
    (recurring ? scope?.timeZone : null) ??
    choices.find((c) => c.id === locationId)?.timeZone ??
    record?.timeZone ??
    "Asia/Riyadh";
  const lastScope = useRef(defaults.scopeId);

  /**
   * The values the rule submits besides the visible controls: the scope's
   * revision and its location/staff/resource for recurring rules, the record's
   * revision otherwise, and no identifiers for controls the rule type hides.
   */
  function syncDerived() {
    const values = form.getValues();
    const set = (name: Path<ScheduleRuleInput>, value: string) => {
      if (form.getValues(name) !== value) form.setValue(name, value);
    };
    if (recurringKinds.includes(values.operation as ScheduleKind)) {
      const current = scopes.find((row) => row.id === values.scopeId);
      set("expectedRevision", current ? String(current.revision) : "");
      set("locationId", current?.locationId ?? "");
      set("staffId", current?.staffId ?? "");
      set("resourceId", current?.resourceId ?? "");
      set("serviceId", "");
      return;
    }
    set("expectedRevision", record ? String(record.revision) : "");
    set("scopeId", values.operation === "scope" && record ? record.id : "");
    if (values.scopeKind === "tenant" || values.scopeKind === "service")
      set("locationId", record?.locationId ?? "");
    if (values.scopeKind !== "staff") set("staffId", "");
    if (values.scopeKind !== "resource") set("resourceId", "");
    if (values.scopeKind !== "service") set("serviceId", "");
  }

  // Keep the derived values in step with the rule type, scope and scope kind.
  useEffect(() => {
    if (recurring && scopeId) lastScope.current = scopeId;
    if (recurring && !scopeId && lastScope.current)
      form.setValue("scopeId", lastScope.current);
    syncDerived();
    // syncDerived reads the latest props and values each time it runs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [operation, scopeId, scopeKind, recurring]);

  // The timezone follows the chosen scope or location, as before.
  useEffect(() => {
    if (form.getValues("timeZone") !== zone) form.setValue("timeZone", zone);
  }, [form, zone]);

  // Staff, resource and service choices depend on the location: start over when it changes.
  const lastLocation = useRef(locationId);
  useEffect(() => {
    if (lastLocation.current === locationId) return;
    lastLocation.current = locationId;
    if (recurring || record) return;
    for (const name of ["staffId", "resourceId", "serviceId"] as const)
      if (form.getValues(name) !== "") form.setValue(name, "");
  }, [form, locationId, recurring, record]);

  const datePlaceholder = workspaceMessage(locale, "datePlaceholder");
  const timePlaceholder = workspaceMessage(locale, "timePlaceholder");
  const scopedChoices = (kind: ScheduleChoice["kind"]): readonly ChoiceOption[] =>
    choices
      .filter(
        (c) => c.kind === kind && (kind === "location" || c.locationId === locationId),
      )
      .map((c) => ({ value: c.id, label: c.name }));
  const foldOptions: readonly ChoiceOption[] = [
    { value: UNAMBIGUOUS_FOLD, label: message("auto") },
    { value: "0", label: message("first") },
    { value: "1", label: message("second") },
  ];
  return (
    <Form form={form} locale={locale} messages={messages}>
      <form
        noValidate
        className="grid gap-5"
        data-schedule-record={record?.id ?? "new"}
        onSubmit={(event) => {
          syncDerived();
          void form.handleSubmit(() => mutation.mutate(form.getValues()))(event);
        }}
      >
        <FieldSet disabled={pending}>
          <FieldLegend className={record ? "sr-only" : undefined}>
            {record ? message("edit") : message("create")}
          </FieldLegend>
          <FieldGroup columns={2}>
            <SelectField
              control={control}
              name="operation"
              label={message("operation")}
              disabled={!!record}
              options={scheduleKinds.map((kind) => ({
                value: kind,
                label: message(kind),
              }))}
              onValueChange={(value) => {
                const next = value as ScheduleKind;
                const kinds = scopeKindsFor(next);
                const current = form.getValues("scopeKind");
                if (next === "maintenance") form.setValue("scopeKind", "resource");
                else if (
                  next === "time_off" &&
                  !["staff", "resource"].includes(current)
                )
                  form.setValue("scopeKind", "staff");
                else if (next === "blackout" || next === "holiday")
                  form.setValue("scopeKind", "location");
                else if (!kinds.includes(current))
                  form.setValue("scopeKind", kinds[0] ?? "location");
              }}
            />
            {recurring ? (
              <SelectField
                control={control}
                name="scopeId"
                label={message("scope")}
                required
                disabled={!!record}
                placeholder={message("choose")}
                options={scopes.map((row) => ({
                  value: row.id,
                  label: (
                    <>
                      {scopeName(row, choices)} · <bdi>{row.timeZone}</bdi> ·{" "}
                      {message("revision")} {row.revision}
                    </>
                  ),
                }))}
              />
            ) : (
              <>
                <SelectField
                  control={control}
                  name="scopeKind"
                  label={message("scopeKind")}
                  disabled={!!record}
                  options={scopeKindsFor(operation).map((kind) => ({
                    value: kind,
                    label: message(kind as ScheduleMessage),
                  }))}
                />
                {scopeKind !== "tenant" && scopeKind !== "service" ? (
                  <SelectField
                    control={control}
                    name="locationId"
                    label={message("location")}
                    required
                    disabled={!!record}
                    options={choices
                      .filter((c) => c.kind === "location")
                      .map((c) => ({
                        value: c.id,
                        label: (
                          <>
                            {c.name} · <bdi>{c.timeZone}</bdi>
                          </>
                        ),
                      }))}
                  />
                ) : null}
                {scopeKind === "staff" ? (
                  <SelectField
                    control={control}
                    name="staffId"
                    label={message("staff")}
                    required
                    placeholder={message("choose")}
                    options={scopedChoices("staff")}
                  />
                ) : null}
                {scopeKind === "resource" ? (
                  <SelectField
                    control={control}
                    name="resourceId"
                    label={message("resource")}
                    required
                    placeholder={message("choose")}
                    options={scopedChoices("resource")}
                  />
                ) : null}
                {scopeKind === "service" ? (
                  <SelectField
                    control={control}
                    name="serviceId"
                    label={message("service")}
                    required
                    placeholder={message("choose")}
                    options={scopedChoices("service")}
                  />
                ) : null}
              </>
            )}
            <TextField
              control={control}
              name="timeZone"
              label={message("timeZone")}
              required
              dir="ltr"
              description={message("dst")}
            />
            {operation === "weekly" || operation === "break" ? (
              <SelectField
                control={control}
                name="dayOfWeek"
                label={message("dayOfWeek")}
                options={Array.from({ length: 7 }, (_, day) => ({
                  value: String(day),
                  label: new Intl.DateTimeFormat(locale === "ar" ? "ar" : "en", {
                    weekday: "long",
                    timeZone: "UTC",
                  }).format(new Date(Date.UTC(2026, 0, 4 + day))),
                }))}
              />
            ) : null}
            {operation === "exception" || operation === "holiday" ? (
              <DateField
                control={control}
                name="localDate"
                label={message("localDate")}
                required
                locale={locale}
                placeholder={datePlaceholder}
              />
            ) : null}
            {operation === "exception" ? (
              <>
                <SelectField
                  control={control}
                  name="exceptionKind"
                  label={message("exceptionKind")}
                  options={[
                    { value: "closed", label: message("closed") },
                    { value: "override", label: message("override") },
                  ]}
                />
                <SelectField
                  control={control}
                  name="fold"
                  label={message("fold")}
                  options={foldOptions}
                />
              </>
            ) : null}
          </FieldGroup>
          {operation === "weekly" ||
          operation === "break" ||
          (operation === "exception" && exceptionKind === "override") ? (
            <FieldGroup columns={3} className="items-end">
              <TimeField
                control={control}
                name="startTime"
                label={message("startTime")}
                required
                locale={locale}
                placeholder={timePlaceholder}
              />
              <TimeField
                control={control}
                name="endTime"
                label={message("endTime")}
                required
                locale={locale}
                placeholder={timePlaceholder}
              />
              <CheckboxField
                control={control}
                name="endOfDay"
                label={message("endOfDay")}
              />
            </FieldGroup>
          ) : null}
          {timed ? (
            <FieldGroup columns={2}>
              <DateTimeField
                control={control}
                name="startsAt"
                label={message("startsAt")}
                required
                locale={locale}
                datePlaceholder={datePlaceholder}
                timePlaceholder={timePlaceholder}
                timeLabel={workspaceMessage(locale, "timeOf", {
                  label: message("startsAt"),
                })}
              />
              <SelectField
                control={control}
                name="startFold"
                label={message("fold")}
                options={foldOptions}
              />
              <DateTimeField
                control={control}
                name="endsAt"
                label={message("endsAt")}
                required
                locale={locale}
                datePlaceholder={datePlaceholder}
                timePlaceholder={timePlaceholder}
                timeLabel={workspaceMessage(locale, "timeOf", {
                  label: message("endsAt"),
                })}
              />
              <SelectField
                control={control}
                name="endFold"
                label={message("fold")}
                options={foldOptions}
              />
            </FieldGroup>
          ) : null}
          {timed || operation === "holiday" ? (
            <FieldGroup columns={2}>
              <TextField
                control={control}
                name="reason"
                label={message("reason")}
                required={operation === "holiday"}
              />
            </FieldGroup>
          ) : null}
          {operation === "policy" ? (
            <FieldGroup columns={2}>
              <SelectField
                control={control}
                name="policyKey"
                label={message("policyKey")}
                options={Object.keys(policyBounds).map((key, index) => ({
                  value: key,
                  label: message(
                    (
                      [
                        "notice",
                        "horizon",
                        "interval",
                        "daily",
                        "before",
                        "after",
                        "turnover",
                        "travel",
                      ] as const
                    )[index]!,
                  ),
                }))}
              />
              <TextField
                control={control}
                name="value"
                label={message("value")}
                type="number"
              />
            </FieldGroup>
          ) : null}
          <FormActions>
            <Button type="submit" loading={pending} loadingLabel={message("saving")}>
              {message("save")}
            </Button>
          </FormActions>
        </FieldSet>
        <MutationFeedback
          locale={locale}
          messages={messages}
          result={mutation.data}
          transportFailed={mutation.isError}
          success={message("saved")}
          reload={{
            codes: ["stale"],
            label: message("reload"),
            onReload: () => router.refresh(),
          }}
        />
      </form>
    </Form>
  );
}

export function ScheduleRemove({
  locale,
  record,
  scopeRevision,
  attempt,
}: {
  locale: Locale;
  record: RecordRow;
  scopeRevision: number | null;
  attempt: string;
}) {
  const [nextAttempt, setNextAttempt] = useState<string | null>(null);
  const mutation = useActionMutation(removeScheduleAction, {
    onSuccess: () => setNextAttempt(newAttemptId()),
  });
  const message = (key: ScheduleMessage) => scheduleMessage(locale, key);
  return (
    <div className="grid gap-3" data-schedule-remove={record.id}>
      <div>
        <ConfirmAction
          destructive
          variant="destructive-outline"
          size="sm"
          label={message("remove")}
          pending={mutation.isPending}
          title={message("removeTitle")}
          description={message("removeHint")}
          confirmLabel={message("remove")}
          cancelLabel={message("cancel")}
          onConfirm={() =>
            mutation.mutate({
              locale,
              requestId: nextAttempt ?? attempt,
              operation: record.kind,
              id: record.id,
              expectedRevision: String(record.revision),
              expectedScopeRevision:
                scopeRevision === null ? "" : String(scopeRevision),
              confirm: "yes",
            })
          }
        />
      </div>
      <MutationFeedback
        locale={locale}
        messages={scheduleErrorMessages(locale)}
        result={mutation.data}
        transportFailed={mutation.isError}
        success={message("removed")}
      />
    </div>
  );
}
