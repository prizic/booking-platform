"use client";
import { useActionState, useEffect, useId, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { RotateCw } from "lucide-react";
import type { Locale } from "@wlbp/i18n";
import {
  Alert,
  AlertDescription,
  Button,
  DatePicker,
  DateTimePicker,
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLegend,
  FieldSet,
  Input,
  Label,
  RequiredMark,
  TimeSelect,
} from "@wlbp/ui-foundation";
import { workspaceMessage } from "../../_lib/workspace-copy";
import type { ScheduleChoice } from "../../_lib/dashboard-access";
import { saveScheduleAction, removeScheduleAction } from "../actions";
import { ConfirmSubmit } from "../services/confirm-submit";
import {
  CheckboxRow,
  ChoiceSelect,
  FormActions,
  keepUnsavedInput,
  type ChoiceOption,
} from "../services/form-kit";
import { scheduleKinds, policyBounds, type ScheduleKind } from "./schedule-fields";
import { scheduleMessage, type ScheduleMessage } from "./schedule-copy";
import { scopeName, type RecordRow } from "./schedule-scope";

/**
 * Select value for "the local time is not repeated". The parser accepts only
 * "0" or "1" as an explicit occurrence and treats every other value — this
 * sentinel included — exactly as it treated the former empty choice.
 */
const UNAMBIGUOUS_FOLD = "auto";

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
  const router = useRouter();
  const [state, action, pending] = useActionState(saveScheduleAction, {});
  const requestId = state.nextRequestId ?? attempt;
  const [operation, setOperation] = useState<ScheduleKind>(record?.kind ?? "weekly");
  const scopes = rows.filter((row) => row.kind === "scope");
  const [scopeId, setScopeId] = useState(record?.scopeId ?? scopes[0]?.id ?? "");
  const scope = scopes.find((row) => row.id === scopeId);
  const [locationId, setLocationId] = useState(
    record?.locationId ??
      scope?.locationId ??
      choices.find((c) => c.kind === "location")?.id ??
      "",
  );
  const [scopeKind, setScopeKind] = useState(
    record?.serviceId
      ? "service"
      : record?.staffId
        ? "staff"
        : record?.resourceId
          ? "resource"
          : "location",
  );
  const [exceptionKind, setExceptionKind] = useState(record?.exceptionKind ?? "closed");
  useEffect(() => {
    if (state.saved) {
      router.refresh();
    }
  }, [state, router]);
  const recurring = ["weekly", "break", "exception"].includes(operation);
  const timed = ["time_off", "blackout", "maintenance"].includes(operation);
  const zone =
    (recurring ? scope?.timeZone : null) ??
    choices.find((c) => c.id === locationId)?.timeZone ??
    record?.timeZone ??
    "Asia/Riyadh";
  const prefix = useId();
  const controlId = (name: string) => `${prefix}-${name}`;
  const errorId = (name: string) => `${prefix}-${name}-error`;
  const invalid = (name: string) => state.field === name;
  const field = (
    name: string,
    label: ScheduleMessage,
    control: ReactNode,
    required = false,
  ) => (
    <Field invalid={invalid(name)}>
      <Label htmlFor={controlId(name)}>
        {message(label)}
        {required ? <RequiredMark /> : null}
      </Label>
      {control}
      {invalid(name) ? (
        <FieldError id={errorId(name)} role="alert">
          {message(state.message ?? "invalid")}
        </FieldError>
      ) : null}
    </Field>
  );
  const input = (
    name: string,
    label: ScheduleMessage,
    type: string,
    value: string | number = "",
    required = true,
  ) =>
    field(
      name,
      label,
      <Input
        id={controlId(name)}
        name={name}
        type={type}
        defaultValue={value}
        required={required}
        aria-invalid={invalid(name) || undefined}
        aria-describedby={invalid(name) ? errorId(name) : undefined}
      />,
      required,
    );
  // Date and time fields submit the same YYYY-MM-DD / HH:MM /
  // YYYY-MM-DDTHH:MM strings the native inputs did, under the same names.
  const describe = (name: string) => ({
    ...(invalid(name)
      ? { "aria-invalid": true, "aria-describedby": errorId(name) }
      : {}),
  });
  const datePlaceholder = workspaceMessage(locale, "datePlaceholder");
  const timePlaceholder = workspaceMessage(locale, "timePlaceholder");
  const datePick = (name: string, label: ScheduleMessage, value: string) =>
    field(
      name,
      label,
      <DatePicker
        id={controlId(name)}
        name={name}
        locale={locale}
        defaultValue={value}
        required
        placeholder={datePlaceholder}
        {...describe(name)}
      />,
      true,
    );
  const timePick = (name: string, label: ScheduleMessage, value: string) =>
    field(
      name,
      label,
      <TimeSelect
        id={controlId(name)}
        name={name}
        locale={locale}
        defaultValue={value}
        required
        placeholder={timePlaceholder}
        {...describe(name)}
      />,
      true,
    );
  const dateTimePick = (name: string, label: ScheduleMessage, value: string) =>
    field(
      name,
      label,
      <DateTimePicker
        id={controlId(name)}
        name={name}
        locale={locale}
        defaultValue={value}
        required
        datePlaceholder={datePlaceholder}
        timePlaceholder={timePlaceholder}
        timeLabel={workspaceMessage(locale, "timeOf", { label: message(label) })}
        {...describe(name)}
      />,
      true,
    );
  const choose = (
    name: string,
    label: ScheduleMessage,
    options: readonly ChoiceOption[],
    props: {
      readonly value?: string;
      readonly defaultValue?: string;
      readonly onValueChange?: (value: string) => void;
      readonly required?: boolean;
      readonly disabled?: boolean;
      readonly placeholder?: ReactNode;
      readonly resetKey?: string;
    } = {},
  ) =>
    field(
      name,
      label,
      <ChoiceSelect
        key={props.resetKey}
        id={controlId(name)}
        name={name}
        options={options}
        invalid={invalid(name)}
        describedBy={invalid(name) ? errorId(name) : undefined}
        {...(props.value === undefined ? {} : { value: props.value })}
        {...(props.defaultValue === undefined
          ? {}
          : { defaultValue: props.defaultValue })}
        {...(props.onValueChange ? { onValueChange: props.onValueChange } : {})}
        {...(props.required ? { required: true } : {})}
        {...(props.disabled ? { disabled: true } : {})}
        {...(props.placeholder === undefined ? {} : { placeholder: props.placeholder })}
      />,
      props.required,
    );
  const select = (
    kind: ScheduleChoice["kind"],
    name: string,
    defaultValue: string | null | undefined,
  ) =>
    choose(
      name,
      kind,
      choices
        .filter(
          (c) =>
            c.kind === kind && (kind === "location" || c.locationId === locationId),
        )
        .map((c) => ({ value: c.id, label: c.name })),
      {
        defaultValue: defaultValue ?? "",
        required: true,
        placeholder: message("choose"),
        // The choices depend on the location; start over when it changes.
        resetKey: `${name}:${locationId}`,
      },
    );
  const fold = (name: string) =>
    choose(
      name,
      "fold",
      [
        { value: UNAMBIGUOUS_FOLD, label: message("auto") },
        { value: "0", label: message("first") },
        { value: "1", label: message("second") },
      ],
      {
        defaultValue:
          record?.fold === null || record?.fold === undefined
            ? UNAMBIGUOUS_FOLD
            : String(record.fold),
      },
    );
  return (
    <form action={action} className="grid gap-5" {...keepUnsavedInput}>
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="requestId" value={requestId} />
      <input type="hidden" name="id" value={record?.id ?? ""} />
      <input
        type="hidden"
        name="expectedRevision"
        value={recurring ? (scope?.revision ?? "") : (record?.revision ?? "")}
      />
      <FieldSet disabled={pending}>
        <FieldLegend className={record ? "sr-only" : undefined}>
          {record ? message("edit") : message("create")}
        </FieldLegend>
        <FieldGroup columns={2}>
          {choose(
            "operation",
            "operation",
            scheduleKinds.map((kind) => ({ value: kind, label: message(kind) })),
            {
              value: operation,
              disabled: !!record,
              onValueChange: (value) => {
                const next = value as ScheduleKind;
                setOperation(next);
                if (next === "maintenance") setScopeKind("resource");
                else if (
                  next === "time_off" &&
                  !["staff", "resource"].includes(scopeKind)
                )
                  setScopeKind("staff");
                else if (next === "blackout" || next === "holiday")
                  setScopeKind("location");
              },
            },
          )}
          {record ? <input type="hidden" name="operation" value={operation} /> : null}
          {recurring
            ? choose(
                "scopeId",
                "scope",
                scopes.map((row) => ({
                  value: row.id,
                  label: (
                    <>
                      {scopeName(row, choices)} · <bdi>{row.timeZone}</bdi> ·{" "}
                      {message("revision")} {row.revision}
                    </>
                  ),
                })),
                {
                  value: scopeId,
                  required: true,
                  disabled: !!record,
                  placeholder: message("choose"),
                  onValueChange: (value) => {
                    setScopeId(value);
                    setLocationId(scopes.find((s) => s.id === value)?.locationId ?? "");
                  },
                },
              )
            : null}
          {record && recurring ? (
            <input type="hidden" name="scopeId" value={scopeId} />
          ) : null}
          {recurring ? (
            <>
              <input name="locationId" type="hidden" value={scope?.locationId ?? ""} />
              <input name="staffId" type="hidden" value={scope?.staffId ?? ""} />
              <input name="resourceId" type="hidden" value={scope?.resourceId ?? ""} />
            </>
          ) : null}
          {operation === "scope" && record ? (
            <input name="scopeId" type="hidden" value={record.id} />
          ) : null}
          {!recurring ? (
            <>
              {choose(
                "scopeKind",
                "scopeKind",
                (operation === "policy"
                  ? ["tenant", "location", "service", "staff", "resource"]
                  : operation === "time_off"
                    ? ["staff", "resource"]
                    : operation === "maintenance"
                      ? ["resource"]
                      : operation === "scope"
                        ? ["location", "staff", "resource"]
                        : ["location"]
                ).map((kind) => ({
                  value: kind,
                  label: message(kind as ScheduleMessage),
                })),
                {
                  value: scopeKind,
                  disabled: !!record,
                  onValueChange: (value) => setScopeKind(value),
                },
              )}
              {record ? (
                <input type="hidden" name="scopeKind" value={scopeKind} />
              ) : null}
              {scopeKind !== "tenant" && scopeKind !== "service"
                ? choose(
                    "locationId",
                    "location",
                    choices
                      .filter((c) => c.kind === "location")
                      .map((c) => ({
                        value: c.id,
                        label: (
                          <>
                            {c.name} · <bdi>{c.timeZone}</bdi>
                          </>
                        ),
                      })),
                    {
                      value: locationId,
                      required: true,
                      disabled: !!record,
                      onValueChange: (value) => setLocationId(value),
                    },
                  )
                : null}
              {record && record.locationId ? (
                <input type="hidden" name="locationId" value={record.locationId} />
              ) : null}
              {scopeKind === "staff"
                ? select("staff", "staffId", record?.staffId)
                : null}
              {scopeKind === "resource"
                ? select("resource", "resourceId", record?.resourceId)
                : null}
              {scopeKind === "service"
                ? select("service", "serviceId", record?.serviceId ?? null)
                : null}
            </>
          ) : null}
          <Field invalid={invalid("timeZone")}>
            <Label htmlFor={controlId("timeZone")}>
              {message("timeZone")}
              <RequiredMark />
            </Label>
            <Input
              key={zone}
              id={controlId("timeZone")}
              name="timeZone"
              type="text"
              dir="ltr"
              defaultValue={zone}
              required
              aria-invalid={invalid("timeZone") || undefined}
              aria-describedby={
                invalid("timeZone")
                  ? `${controlId("timeZone")}-dst ${errorId("timeZone")}`
                  : `${controlId("timeZone")}-dst`
              }
            />
            <FieldDescription id={`${controlId("timeZone")}-dst`}>
              {message("dst")}
            </FieldDescription>
            {invalid("timeZone") ? (
              <FieldError id={errorId("timeZone")} role="alert">
                {message(state.message ?? "invalid")}
              </FieldError>
            ) : null}
          </Field>
          {operation === "weekly" || operation === "break"
            ? choose(
                "dayOfWeek",
                "dayOfWeek",
                Array.from({ length: 7 }, (_, day) => ({
                  value: String(day),
                  label: new Intl.DateTimeFormat(locale === "ar" ? "ar" : "en", {
                    weekday: "long",
                    timeZone: "UTC",
                  }).format(new Date(Date.UTC(2026, 0, 4 + day))),
                })),
                { defaultValue: String(record?.dayOfWeek ?? 1) },
              )
            : null}
          {operation === "exception" || operation === "holiday"
            ? datePick("localDate", "localDate", record?.localDate ?? "")
            : null}
          {operation === "exception" ? (
            <>
              {choose(
                "exceptionKind",
                "exceptionKind",
                [
                  { value: "closed", label: message("closed") },
                  { value: "override", label: message("override") },
                ],
                {
                  value: exceptionKind,
                  onValueChange: (value) =>
                    setExceptionKind(value as "closed" | "override"),
                },
              )}
              {fold("fold")}
            </>
          ) : null}
        </FieldGroup>
        {operation === "weekly" ||
        operation === "break" ||
        (operation === "exception" && exceptionKind === "override") ? (
          <FieldGroup columns={3} className="items-end">
            {timePick("startTime", "startTime", timeValue(record?.startMinute ?? 540))}
            {timePick("endTime", "endTime", timeValue(record?.endMinute ?? 1020))}
            <CheckboxRow
              id={controlId("endOfDay")}
              name="endOfDay"
              defaultChecked={record?.endMinute === 1440}
            >
              {message("endOfDay")}
            </CheckboxRow>
          </FieldGroup>
        ) : null}
        {timed ? (
          <FieldGroup columns={2}>
            {dateTimePick(
              "startsAt",
              "startsAt",
              localValue(record?.startsAt ?? null, zone),
            )}
            {fold("startFold")}
            {dateTimePick("endsAt", "endsAt", localValue(record?.endsAt ?? null, zone))}
            {fold("endFold")}
          </FieldGroup>
        ) : null}
        {timed || operation === "holiday" ? (
          <FieldGroup columns={2}>
            {input(
              "reason",
              "reason",
              "text",
              record?.reason ?? "",
              operation === "holiday",
            )}
          </FieldGroup>
        ) : null}
        {operation === "policy" ? (
          <FieldGroup columns={2}>
            {choose(
              "policyKey",
              "policyKey",
              Object.keys(policyBounds).map((key, index) => ({
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
              })),
              { defaultValue: record?.policyKey ?? "minimum_notice_minutes" },
            )}
            {input("value", "value", "number", record?.value ?? "", false)}
          </FieldGroup>
        ) : null}
        <FormActions>
          <Button type="submit" loading={pending} loadingLabel={message("saving")}>
            {message("save")}
          </Button>
        </FormActions>
      </FieldSet>
      {state.message ? (
        <Alert tone={state.saved ? "positive" : "danger"}>
          <AlertDescription className="flex flex-wrap items-center gap-3 text-foreground">
            <span>{message(state.message)}</span>
            {state.message === "stale" ? (
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
    </form>
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
  const [state, action, pending] = useActionState(removeScheduleAction, {});
  const requestId = state.nextRequestId ?? attempt;
  const router = useRouter();
  useEffect(() => {
    if (state.saved) {
      router.refresh();
    }
  }, [state, router]);
  const message = (key: ScheduleMessage) => scheduleMessage(locale, key);
  return (
    <form action={action} className="grid gap-3">
      <input name="locale" type="hidden" value={locale} />
      <input name="requestId" type="hidden" value={requestId} />
      <input name="operation" type="hidden" value={record.kind} />
      <input name="id" type="hidden" value={record.id} />
      <input name="expectedRevision" type="hidden" value={record.revision} />
      <input name="expectedScopeRevision" type="hidden" value={scopeRevision ?? ""} />
      <div>
        <ConfirmSubmit
          destructive
          variant="destructive-outline"
          size="sm"
          label={message("remove")}
          pending={pending}
          title={message("removeTitle")}
          description={message("removeHint")}
          confirmLabel={message("remove")}
          cancelLabel={message("cancel")}
        />
      </div>
      {state.message ? (
        <Alert tone={state.saved ? "positive" : "danger"}>
          <AlertDescription className="text-foreground">
            {message(state.message)}
          </AlertDescription>
        </Alert>
      ) : null}
    </form>
  );
}
