import { z } from "zod";
import { asUuid, formLocale, optionalText } from "./fields";

const isoDate = /^\d{4}-\d{2}-\d{2}$/u;
/** URL filters: a malformed value is ignored, exactly as the list page ignores it. */
const filterDate = optionalText().transform((value) =>
  value && isoDate.test(value) ? value : undefined,
);

export const exportAuditSchema = z.object({
  q: optionalText(),
  family: optionalText(),
  tenant: optionalText().transform(asUuid),
  outcome: optionalText(),
  from: filterDate,
  to: filterDate,
  locale: formLocale,
});
export type ExportAuditInput = z.input<typeof exportAuditSchema>;
