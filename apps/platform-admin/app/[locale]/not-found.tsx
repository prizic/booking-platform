import { Button } from "@wlbp/ui-foundation";
import { SearchX } from "lucide-react";
import Link from "next/link";
import { authCopy } from "../_lib/auth-copy";

/** Rendered without a known locale, so it speaks both languages. */
export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center bg-background px-4 py-10">
      <section className="grid w-full max-w-lg justify-items-center gap-5 rounded-lg border bg-card p-6 text-center text-card-foreground shadow-sm md:p-8">
        <span
          aria-hidden="true"
          className="grid size-12 place-items-center rounded-full bg-neutral-2 text-muted-foreground"
        >
          <SearchX className="size-6" />
        </span>
        <h1 className="grid gap-1 text-xl leading-snug font-bold text-balance">
          <span lang="ar" dir="rtl">
            {authCopy.notFoundTitle[1]}
          </span>
          <span lang="en" className="text-base font-semibold text-muted-foreground">
            {authCopy.notFoundTitle[0]}
          </span>
        </h1>
        <div className="grid gap-1 text-sm leading-relaxed text-muted-foreground">
          <p lang="ar" dir="rtl">
            {authCopy.notFoundBody[1]}
          </p>
          <p lang="en">{authCopy.notFoundBody[0]}</p>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          <Button asChild>
            <Link href="/ar" lang="ar" hrefLang="ar">
              {authCopy.returnHome[1]}
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/en" lang="en" hrefLang="en">
              {authCopy.returnHome[0]}
            </Link>
          </Button>
        </div>
      </section>
    </main>
  );
}
