import type { Locale } from "@wlbp/i18n";
import { redirect } from "next/navigation";

export default async function DashboardHome({
  params,
}: {
  readonly params: Promise<{ locale: Locale }>;
}) {
  const { locale } = await params;
  redirect(`/${locale}/today`);
}
