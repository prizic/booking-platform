import type { Locale } from "@wlbp/i18n";
import { CatalogListPage } from "../services/catalog-pages";
export const dynamic = "force-dynamic";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: Locale }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <CatalogListPage
      locale={(await params).locale}
      kind="location"
      query={await searchParams}
    />
  );
}
