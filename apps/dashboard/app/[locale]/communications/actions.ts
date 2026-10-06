"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { loadDashboardRequestAccess } from "../../_lib/dashboard-server";
export interface CommunicationResult {
  readonly error?: boolean;
}
export async function retryCommunication(
  _state: CommunicationResult,
  form: FormData,
): Promise<CommunicationResult> {
  const locale = form.get("locale") === "ar" ? "ar" : "en";
  const bookingId = form.get("bookingId");
  if (
    form.get("confirm") !== "yes" ||
    typeof bookingId !== "string" ||
    !/^[a-f0-9-]{36}$/iu.test(bookingId)
  )
    return { error: true };
  const request = await loadDashboardRequestAccess(locale);
  if (request.state.kind !== "ready" || !request.source?.resendBookingNotification)
    return { error: true };
  try {
    await request.source.resendBookingNotification({
      tenantId: request.state.context.tenantId,
      bookingId,
    });
    for (const path of ["communications", "bookings", "today"])
      revalidatePath(`/${locale}/${path}`);
    revalidatePath(`/${locale}/bookings/${bookingId}`);
  } catch {
    return { error: true };
  }
  redirect(`/${locale}/communications?result=queued`);
}
