import { Button } from "@wlbp/ui-foundation";
import Link from "next/link";

import { getClientMessage } from "../_lib/copy";

/*
 * Rendered without a known locale, so the page speaks both languages at once
 * and offers a way home in each.
 */
export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center bg-background px-4 py-16 text-foreground">
      <div className="grid max-w-xl justify-items-center gap-6 text-center">
        <h1 className="grid gap-2 text-2xl leading-tight font-bold text-balance md:text-3xl">
          <span lang="ar" dir="rtl">
            {getClientMessage("ar", "notFoundTitle")}
          </span>
          <span
            lang="en"
            dir="ltr"
            className="text-xl font-semibold text-muted-foreground"
          >
            {getClientMessage("en", "notFoundTitle")}
          </span>
        </h1>
        <div className="grid gap-1 text-[0.9375rem] leading-relaxed text-muted-foreground">
          <p lang="ar" dir="rtl">
            {getClientMessage("ar", "notFoundBody")}
          </p>
          <p lang="en" dir="ltr">
            {getClientMessage("en", "notFoundBody")}
          </p>
        </div>
        <div className="flex flex-wrap justify-center gap-3">
          <Button asChild>
            <Link href="/ar" lang="ar" dir="rtl">
              {getClientMessage("ar", "returnHome")}
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/en" lang="en" dir="ltr">
              {getClientMessage("en", "returnHome")}
            </Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
