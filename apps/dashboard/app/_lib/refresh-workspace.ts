// The reviewed public server entry owns the server-only poison marker.
import "@wlbp/supabase-client/server";
import { revalidatePath } from "next/cache";
import type { Locale } from "@wlbp/i18n";

/** Mutations invalidate every dependent operational read, including detail routes. */
export function refreshWorkspace(locale: Locale): void {
  for (const path of [
    "today",
    "calendar",
    "bookings",
    "requests",
    "customers",
    "payments",
    "communications",
    "reports",
    "audit",
  ]) {
    revalidatePath(`/${locale}/${path}`, "layout");
  }
}
