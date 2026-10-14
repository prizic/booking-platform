import {
  parseBookingRecoveryV1Response,
  type BookingRecoveryV1Response,
} from "@wlbp/api-contracts";
import type { PublicRpcClient } from "./public-read-context";

export async function requestBookingRecovery(
  api: PublicRpcClient,
  hostname: string,
  email: string,
  requestId: string,
  trustedClientIp?: string,
): Promise<BookingRecoveryV1Response> {
  let request = api.rpc("request_booking_recovery_v1", {
    p_hostname: hostname,
    p_application: "client",
    p_email: email,
    p_request_id: requestId,
  });
  // PostgREST's request-local header setter keeps this metadata off all other reads.
  if (trustedClientIp && request.setHeader)
    request = request.setHeader("x-forwarded-for", trustedClientIp);
  const result = await request;
  if (result.error) throw new Error("recovery_unavailable");
  return parseBookingRecoveryV1Response(result.data);
}
