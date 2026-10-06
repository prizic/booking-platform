"use client";
import { useActionState, useEffect, useId, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { Locale } from "@wlbp/i18n";
import type { ScheduleChoice } from "../../_lib/dashboard-access";
import { saveScheduleAction, removeScheduleAction } from "../actions";
import { scheduleKinds, policyBounds, type ScheduleKind } from "./schedule-fields";
import { scheduleMessage, type ScheduleMessage } from "./schedule-copy";
import { scopeName, type RecordRow } from "./schedule-scope";
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
  const field = (name: string, label: ScheduleMessage, control: ReactNode) => (
    <label htmlFor={`${prefix}-${name}`}>
      {message(label)}
      {control}
      {state.field === name ? (
        <span role="alert">{message(state.message ?? "invalid")}</span>
      ) : null}
    </label>
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
      <input
        id={`${prefix}-${name}`}
        name={name}
        type={type}
        defaultValue={value}
        required={required}
        aria-invalid={state.field === name || undefined}
      />,
    );
  const select = (
    kind: ScheduleChoice["kind"],
    name: string,
    defaultValue: string | null | undefined,
  ) =>
    field(
      name,
      kind,
      <select
        id={`${prefix}-${name}`}
        name={name}
        defaultValue={defaultValue ?? ""}
        required
      >
        <option value="">{message("choose")}</option>
        {choices
          .filter(
            (c) =>
              c.kind === kind && (kind === "location" || c.locationId === locationId),
          )
          .map((c) => (
            <option key={`${c.id}:${c.locationId}`} value={c.id}>
              {c.name}
            </option>
          ))}
      </select>,
    );
  const fold = (name: string) =>
    field(
      name,
      "fold",
      <select
        id={`${prefix}-${name}`}
        name={name}
        defaultValue={
          record?.fold === null || record?.fold === undefined ? "" : record.fold
        }
      >
        <option value="">{message("auto")}</option>
        <option value="0">{message("first")}</option>
        <option value="1">{message("second")}</option>
      </select>,
    );
  return (
    <form
      action={action}
      className="catalog-form"
      onReset={(event) => event.preventDefault()}
    >
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="requestId" value={requestId} />
      <input type="hidden" name="id" value={record?.id ?? ""} />
      <input
        type="hidden"
        name="expectedRevision"
        value={recurring ? (scope?.revision ?? "") : (record?.revision ?? "")}
      />
      <fieldset disabled={pending}>
        <legend>{record ? message("edit") : message("create")}</legend>
        {field(
          "operation",
          "operation",
          <select
            id={`${prefix}-operation`}
            name="operation"
            value={operation}
            onChange={(event) => {
              const next = event.target.value as ScheduleKind;
              setOperation(next);
              if (next === "maintenance") setScopeKind("resource");
              else if (
                next === "time_off" &&
                !["staff", "resource"].includes(scopeKind)
              )
                setScopeKind("staff");
              else if (next === "blackout" || next === "holiday")
                setScopeKind("location");
            }}
            disabled={!!record}
          >
            {scheduleKinds.map((kind) => (
              <option key={kind} value={kind}>
                {message(kind)}
              </option>
            ))}
          </select>,
        )}
        {record ? <input type="hidden" name="operation" value={operation} /> : null}
        {recurring
          ? field(
              "scopeId",
              "scope",
              <select
                id={`${prefix}-scopeId`}
                name="scopeId"
                value={scopeId}
                required
                onChange={(event) => {
                  setScopeId(event.target.value);
                  setLocationId(
                    scopes.find((s) => s.id === event.target.value)?.locationId ?? "",
                  );
                }}
                disabled={!!record}
              >
                <option value="">{message("choose")}</option>
                {scopes.map((row) => (
                  <option key={row.id} value={row.id}>
                    {scopeName(row, choices)} · {row.timeZone} · {message("revision")}{" "}
                    {row.revision}
                  </option>
                ))}
              </select>,
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
            {field(
              "scopeKind",
              "scopeKind",
              <select
                id={`${prefix}-scopeKind`}
                name="scopeKind"
                value={scopeKind}
                onChange={(event) => setScopeKind(event.target.value)}
                disabled={!!record}
              >
                {(operation === "policy"
                  ? ["tenant", "location", "service", "staff", "resource"]
                  : operation === "time_off"
                    ? ["staff", "resource"]
                    : operation === "maintenance"
                      ? ["resource"]
                      : operation === "scope"
                        ? ["location", "staff", "resource"]
                        : ["location"]
                ).map((kind) => (
                  <option key={kind} value={kind}>
                    {kind === "tenant"
                      ? locale === "ar"
                        ? "المؤسسة"
                        : "Tenant"
                      : message(kind as ScheduleMessage)}
                  </option>
                ))}
              </select>,
            )}
            {record ? <input type="hidden" name="scopeKind" value={scopeKind} /> : null}
            {scopeKind !== "tenant" && scopeKind !== "service"
              ? field(
                  "locationId",
                  "location",
                  <select
                    id={`${prefix}-locationId`}
                    name="locationId"
                    value={locationId}
                    required
                    onChange={(event) => setLocationId(event.target.value)}
                    disabled={!!record}
                  >
                    {choices
                      .filter((c) => c.kind === "location")
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} · {c.timeZone}
                        </option>
                      ))}
                  </select>,
                )
              : null}
            {record && record.locationId ? (
              <input type="hidden" name="locationId" value={record.locationId} />
            ) : null}
            {scopeKind === "staff" ? select("staff", "staffId", record?.staffId) : null}
            {scopeKind === "resource"
              ? select("resource", "resourceId", record?.resourceId)
              : null}
            {scopeKind === "service"
              ? select("service", "serviceId", record?.serviceId ?? null)
              : null}
          </>
        ) : null}
        {field(
          "timeZone",
          "timeZone",
          <input
            key={zone}
            id={`${prefix}-timeZone`}
            name="timeZone"
            type="text"
            defaultValue={zone}
            required
          />,
        )}
        <p className="field-help">{message("dst")}</p>
        {operation === "weekly" || operation === "break"
          ? field(
              "dayOfWeek",
              "dayOfWeek",
              <select
                id={`${prefix}-dayOfWeek`}
                name="dayOfWeek"
                defaultValue={record?.dayOfWeek ?? 1}
              >
                {Array.from({ length: 7 }, (_, day) => (
                  <option key={day} value={day}>
                    {new Intl.DateTimeFormat(locale === "ar" ? "ar" : "en", {
                      weekday: "long",
                      timeZone: "UTC",
                    }).format(new Date(Date.UTC(2026, 0, 4 + day)))}
                  </option>
                ))}
              </select>,
            )
          : null}
        {operation === "exception" || operation === "holiday"
          ? input("localDate", "localDate", "date", record?.localDate ?? "")
          : null}
        {operation === "exception" ? (
          <>
            {field(
              "exceptionKind",
              "exceptionKind",
              <select
                id={`${prefix}-exceptionKind`}
                name="exceptionKind"
                value={exceptionKind}
                onChange={(event) =>
                  setExceptionKind(event.target.value as "closed" | "override")
                }
              >
                <option value="closed">{message("closed")}</option>
                <option value="override">{message("override")}</option>
              </select>,
            )}
            {fold("fold")}
          </>
        ) : null}
        {operation === "weekly" ||
        operation === "break" ||
        (operation === "exception" && exceptionKind === "override") ? (
          <div className="catalog-columns">
            {input(
              "startTime",
              "startTime",
              "time",
              timeValue(record?.startMinute ?? 540),
            )}
            {input("endTime", "endTime", "time", timeValue(record?.endMinute ?? 1020))}
            <label>
              <input
                type="checkbox"
                name="endOfDay"
                value="yes"
                defaultChecked={record?.endMinute === 1440}
              />
              {message("endOfDay")}
            </label>
          </div>
        ) : null}
        {timed ? (
          <div className="catalog-columns">
            {input(
              "startsAt",
              "startsAt",
              "datetime-local",
              localValue(record?.startsAt ?? null, zone),
            )}
            {fold("startFold")}
            {input(
              "endsAt",
              "endsAt",
              "datetime-local",
              localValue(record?.endsAt ?? null, zone),
            )}
            {fold("endFold")}
          </div>
        ) : null}
        {timed || operation === "holiday"
          ? input(
              "reason",
              "reason",
              "text",
              record?.reason ?? "",
              operation === "holiday",
            )
          : null}
        {operation === "policy" ? (
          <>
            {field(
              "policyKey",
              "policyKey",
              <select
                id={`${prefix}-policyKey`}
                name="policyKey"
                defaultValue={record?.policyKey ?? "minimum_notice_minutes"}
              >
                {Object.keys(policyBounds).map((key, index) => (
                  <option key={key} value={key}>
                    {message(
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
                    )}
                  </option>
                ))}
              </select>,
            )}
            {input("value", "value", "number", record?.value ?? "", false)}
          </>
        ) : null}
        <button className="wlbp-button" type="submit">
          {message(pending ? "saving" : "save")}
        </button>
      </fieldset>
      {state.message ? (
        <p role={state.saved ? "status" : "alert"}>{message(state.message)}</p>
      ) : null}
      {state.message === "stale" ? (
        <button type="button" onClick={() => router.refresh()}>
          {message("reload")}
        </button>
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
  return (
    <form action={action}>
      <input name="locale" type="hidden" value={locale} />
      <input name="requestId" type="hidden" value={requestId} />
      <input name="operation" type="hidden" value={record.kind} />
      <input name="id" type="hidden" value={record.id} />
      <input name="expectedRevision" type="hidden" value={record.revision} />
      <input name="expectedScopeRevision" type="hidden" value={scopeRevision ?? ""} />
      <label>
        <input name="confirm" type="checkbox" value="yes" required />
        {scheduleMessage(locale, "confirm")}
      </label>
      <button disabled={pending} type="submit">
        {scheduleMessage(locale, "remove")}
      </button>
      {state.message ? (
        <p role={state.saved ? "status" : "alert"}>
          {scheduleMessage(locale, state.message)}
        </p>
      ) : null}
    </form>
  );
}
