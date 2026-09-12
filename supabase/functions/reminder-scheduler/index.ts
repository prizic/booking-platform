// Issue #101. Schedules due reminders in bounded batches.
//
// There is no logic here at all, and that is the point: a reminder is an outbox
// intent with a future `available_at`, so scheduling one is
// `schedule_booking_reminders_v1` and nothing else. It is idempotent on the
// intent key, so running it twice schedules nothing twice, and it supersedes
// reminders whose booking moved.
import { callRpc, json, platformConfigured, unconfigured } from "../_shared/rpc.ts";

const batchSize = Number(Deno.env.get("REMINDER_BATCH_SIZE") ?? "200");

Deno.serve(async (): Promise<Response> => {
  if (!platformConfigured()) return unconfigured();
  const result = await callRpc<{ scheduled: number; superseded: number }>(
    "schedule_booking_reminders_v1",
    { p_limit: batchSize, p_tenant_id: null },
  );
  if (result === null) return json({ error: "not_scheduled" }, 500);
  return json(result[0] ?? { scheduled: 0, superseded: 0 });
});
