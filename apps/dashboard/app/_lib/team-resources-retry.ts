import type { Locale } from "@wlbp/i18n";

const FORM_ID_PATTERN = /^[a-z0-9-]{1,100}$/u;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export interface TeamResourcesRetry {
  readonly formId: string;
  readonly requestId: string;
}

export function parseTeamResourcesRetry(
  formId: unknown,
  requestId: unknown,
): TeamResourcesRetry | undefined {
  if (
    typeof formId !== "string" ||
    typeof requestId !== "string" ||
    !FORM_ID_PATTERN.test(formId) ||
    !UUID_PATTERN.test(requestId)
  ) {
    return undefined;
  }

  return { formId, requestId };
}

export function getTeamResourcesResultUrl(
  locale: Locale,
  result: string,
  retry?: TeamResourcesRetry,
): string {
  const search = new URLSearchParams({ result });
  if (result === "backend-unavailable" && retry !== undefined) {
    search.set("retryForm", retry.formId);
    search.set("retryId", retry.requestId);
  }
  return `/${locale}/team-resources?${search.toString()}`;
}
