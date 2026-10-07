import { Button } from "@wlbp/ui-foundation";
import { SearchX } from "lucide-react";
import Link from "next/link";
import { getDashboardMessage } from "../_lib/copy";
import { workspaceMessage } from "../_lib/workspace-copy";

// The locale may be the unknown part of the URL, so this page speaks both.
export default function NotFound() {
  return (
    <main
      id="main-content"
      dir="auto"
      className="grid min-h-dvh place-items-center bg-background px-4 py-16"
    >
      <div className="grid max-w-lg justify-items-center gap-5 text-center">
        <div className="grid size-12 place-items-center rounded-full bg-neutral-2 text-muted-foreground">
          <SearchX aria-hidden="true" className="size-6" />
        </div>
        <p className="text-sm font-semibold text-muted-foreground">
          <span lang="ar">{workspaceMessage("ar", "notFoundCode")}</span>
          <span aria-hidden="true"> · </span>
          <span lang="en">{workspaceMessage("en", "notFoundCode")}</span>
        </p>
        <h1 className="grid gap-1 text-2xl leading-tight font-bold text-balance">
          <span lang="ar" dir="rtl">
            {getDashboardMessage("ar", "notFoundTitle")}
          </span>
          <span
            lang="en"
            dir="ltr"
            className="text-xl font-semibold text-muted-foreground"
          >
            {getDashboardMessage("en", "notFoundTitle")}
          </span>
        </h1>
        <div className="flex flex-wrap justify-center gap-3">
          <Button asChild>
            <Link href="/ar" lang="ar">
              {getDashboardMessage("ar", "returnHome")}
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/en" lang="en">
              {getDashboardMessage("en", "returnHome")}
            </Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
