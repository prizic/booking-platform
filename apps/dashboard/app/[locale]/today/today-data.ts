import type { Locale } from "@wlbp/i18n";
import { calendarRange, civilDate } from "../calendar/calendar-range";
import {
  loadDashboardRequestAccess,
  type DashboardRequestAccess,
} from "../../_lib/dashboard-server";
import {
  classifyReadFailure,
  recordReadFailure,
  type ReadFailure,
} from "../../_lib/read-diagnostics";
export async function loadToday(
  locale: Locale,
  providedRequest?: DashboardRequestAccess,
) {
  const request = providedRequest ?? (await loadDashboardRequestAccess(locale));
  if (
    request.state.kind !== "ready" ||
    !request.source?.getTodayWorkspace ||
    !request.source.getOperationalChoices
  ) {
    const outcome =
      request.state.kind === "configuration-missing" ||
      (request.state.kind === "denied" &&
        ["invalid_host", "tenant_context_mismatch"].includes(request.state.reason))
        ? "tenant_setup"
        : request.state.kind === "denied" &&
            request.state.reason === "backend_unavailable"
          ? "transport_unavailable"
          : "access_denied";
    return { kind: "failure" as const, outcome: outcome as ReadFailure };
  }
  let choices;
  try {
    choices = await request.source.getOperationalChoices(
      request.state.context.tenantId,
      locale,
    );
  } catch (error) {
    const outcome = classifyReadFailure(error);
    const correlation = recordReadFailure("today_choices", outcome, error);
    return { kind: "failure" as const, outcome, correlation };
  }
  // Only an authorized workspace location can decide the civil day. An absent
  // catalog zone is a setup problem, never an arbitrary successful empty day.
  let timeZone = choices.offers[0]?.timeZone;
  if (!timeZone && request.source.getScheduleChoices) {
    try {
      timeZone = (
        await request.source.getScheduleChoices(request.state.context.tenantId)
      ).find((choice) => choice.kind === "location")?.timeZone;
    } catch (error) {
      const outcome = classifyReadFailure(error);
      const correlation = recordReadFailure("today_choices", outcome, error);
      return { kind: "failure" as const, outcome, correlation };
    }
  }
  if (!timeZone) {
    recordReadFailure("today_choices", "tenant_setup");
    return { kind: "failure" as const, outcome: "tenant_setup" as const };
  }
  try {
    const date = civilDate(new Date(), timeZone);
    const range = calendarRange(date, timeZone);
    const items = await request.source.getTodayWorkspace({
      ...range,
      tenantId: request.state.context.tenantId,
    });
    return {
      kind: "ready" as const,
      items,
      date,
      timeZone,
      range,
      choices,
      canCreate: choices.offers.some((offer) => offer.canCreate),
    };
  } catch (error) {
    const outcome = classifyReadFailure(error);
    const correlation = recordReadFailure("today_items", outcome, error);
    return { kind: "failure" as const, outcome, correlation };
  }
}
