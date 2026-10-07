// Staff daily agenda digest. Enqueues, never sends.
//
// Who gets a digest and when is the database's decision:
// `enqueue_staff_daily_digests_v1` finds members who opted in to
// `staff.daily_digest` whose `digest_local_time` has passed today in their
// location's time zone, and writes one outbox intent per member per local day
// — idempotent on that pair, so this running every 15 minutes (or twice) never
// sends a second digest. The intent carries raw rows (`local_date`,
// `time_zone`, `bookings[]` with a customer's first name only); the
// notification worker renders and sends it through the ordinary email path,
// with its retries, suppressions and delivery ledger.
import {
  callRpc,
  isInternalInvocation,
  json,
  platformConfigured,
  unauthorized,
  unconfigured,
} from "../_shared/rpc.ts";

const batchSize = Number(Deno.env.get("STAFF_DIGEST_BATCH_SIZE") ?? "200");

Deno.serve(async (request: Request): Promise<Response> => {
  if (!isInternalInvocation(request)) return unauthorized();
  if (!platformConfigured()) return unconfigured();
  const result = await callRpc<{ enqueued: number }>("enqueue_staff_daily_digests_v1", {
    p_limit: Number.isInteger(batchSize) && batchSize > 0 ? batchSize : 200,
  });
  if (result === null) return json({ error: "not_enqueued" }, 500);
  return json(result[0] ?? { enqueued: 0 });
});
