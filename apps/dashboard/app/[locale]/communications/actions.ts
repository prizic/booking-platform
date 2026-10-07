"use server";
import { revalidatePath } from "next/cache";
import {
  actionError,
  actionOk,
  parseActionInput,
  type ActionResult,
} from "@wlbp/ui-foundation/actions";
import { loadDashboardRequestAccess } from "../../_lib/dashboard-server";
import { communicationRetrySchema, type CommunicationRetryInput } from "./retry-schema";

export async function retryCommunication(
  input: CommunicationRetryInput,
): Promise<ActionResult<{ readonly destination: string }>> {
  const parsed = parseActionInput(communicationRetrySchema, input);
  if (!parsed.ok) return parsed.result;
  const { locale, bookingId } = parsed.data;
  const request = await loadDashboardRequestAccess(locale);
  if (request.state.kind !== "ready" || !request.source?.resendBookingNotification)
    return actionError("refused");
  try {
    await request.source.resendBookingNotification({
      tenantId: request.state.context.tenantId,
      bookingId,
    });
    for (const path of ["communications", "bookings", "today"])
      revalidatePath(`/${locale}/${path}`);
    revalidatePath(`/${locale}/bookings/${bookingId}`);
  } catch {
    return actionError("refused");
  }
  return actionOk({ destination: `/${locale}/communications?result=queued` });
}
