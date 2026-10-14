"use client";
import { useParams } from "next/navigation";
import { DataPage, LoadingState } from "@wlbp/ui-foundation";
import type { WorkspaceSection } from "./workspace-navigation";
import {
  getWorkspaceNavigation,
  implementedWorkspaceSections,
} from "./workspace-navigation";
export function WorkspaceLoading({ section }: { section: WorkspaceSection }) {
  const params = useParams();
  const locale = params.locale === "ar" ? "ar" : "en";
  const title =
    getWorkspaceNavigation({
      locale,
      current: section,
      enabledSections: implementedWorkspaceSections,
    }).find((item) => item.section === section)?.label ??
    (locale === "ar" ? "جارٍ التحميل…" : "Loading…");
  return (
    <div className="mx-auto grid max-w-7xl gap-6 p-4 md:p-8">
      <DataPage title={title} titleId="workspace-loading-title" busy>
        <LoadingState
          label={
            locale === "ar"
              ? "جارٍ تحميل بيانات مساحة العمل…"
              : "Loading workspace data…"
          }
        />
      </DataPage>
    </div>
  );
}
