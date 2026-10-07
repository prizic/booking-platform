import type { ScheduleWorkspaceRowV1 } from "@wlbp/api-contracts";
import type { ScheduleChoice } from "../../_lib/dashboard-access";
export type RecordRow = ScheduleWorkspaceRowV1 & {
  readonly fold?: 0 | 1 | null;
  readonly serviceId?: string | null;
};
export function scopeName(row: RecordRow, choices: readonly ScheduleChoice[]): string {
  return [row.locationId, row.staffId, row.resourceId, row.serviceId]
    .filter(Boolean)
    .map((id) => choices.find((c) => c.id === id)?.name ?? "—")
    .join(" · ");
}
