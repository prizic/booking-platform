import type { Locale } from "@wlbp/i18n";
import { CatalogEditorPage } from "../../services/catalog-pages";
export const dynamic = "force-dynamic";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: Locale; categoryId: string }>;
  searchParams: Promise<{ result?: string }>;
}) {
  const { locale, categoryId } = await params;
  const { result } = await searchParams;
  return (
    <CatalogEditorPage
      locale={locale}
      kind="category"
      id={categoryId}
      result={result}
    />
  );
}
