import type { Locale } from "@wlbp/i18n";
import { CatalogEditorPage } from "../catalog-pages";
export const dynamic = "force-dynamic";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: Locale; serviceId: string }>;
  searchParams: Promise<{ result?: string }>;
}) {
  const { locale, serviceId } = await params;
  const { result } = await searchParams;
  return (
    <CatalogEditorPage locale={locale} kind="service" id={serviceId} result={result} />
  );
}
