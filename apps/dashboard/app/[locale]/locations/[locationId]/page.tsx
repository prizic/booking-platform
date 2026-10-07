import type { Locale } from "@wlbp/i18n";
import { CatalogEditorPage } from "../../services/catalog-pages";
export const dynamic = "force-dynamic";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: Locale; locationId: string }>;
  searchParams: Promise<{ result?: string }>;
}) {
  const { locale, locationId } = await params;
  const { result } = await searchParams;
  return (
    <CatalogEditorPage
      locale={locale}
      kind="location"
      id={locationId}
      result={result}
    />
  );
}
