import type { Locale } from "@wlbp/i18n";
import { Button } from "@wlbp/ui-foundation";
import { WifiOff } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";

import { clientBrand } from "../../_lib/brand";
import { instanceText } from "../../_lib/instance-text";
import { OfflineRetryButton } from "../../_lib/offline-retry-button";
import { pwaMessage } from "../../_lib/pwa-copy";

type OfflinePageProps = {
  params: Promise<{ locale: Locale }>;
};

export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * The page the service worker shows when a navigation fails for lack of a
 * network. It is precached without cookies, so it must stay free of anything
 * person-specific, and it loads only static files (the unoptimized brand icon
 * is a plain /assets/ file the worker caches; /_next/image is never cached).
 */
export default async function OfflinePage({ params }: OfflinePageProps) {
  const { locale } = await params;
  const text = instanceText(locale);
  const brandName = text("brand.name");

  return (
    <main
      id="main"
      aria-labelledby="offline-title"
      className="grid min-h-dvh place-items-center bg-background px-4 py-16 text-foreground"
    >
      <div className="grid max-w-md justify-items-center gap-6 text-center">
        <div className="flex items-center gap-3">
          <Image
            alt=""
            className="size-10 rounded-md"
            height={80}
            src={clientBrand.assets.icon}
            unoptimized
            width={80}
          />
          <span className="text-lg font-bold">{brandName}</span>
        </div>
        <div className="grid size-14 place-items-center rounded-full bg-muted text-muted-foreground">
          <WifiOff aria-hidden="true" className="size-6" />
        </div>
        <div className="grid gap-2">
          <h1
            id="offline-title"
            className="text-2xl leading-tight font-bold text-balance"
          >
            {text("pwa.offline.title")}
          </h1>
          <p className="leading-relaxed text-pretty text-muted-foreground">
            {text("pwa.offline.body")}
          </p>
        </div>
        <div className="flex flex-wrap justify-center gap-3">
          <OfflineRetryButton label={pwaMessage(locale, "offlineRetry")} />
          <Button asChild variant="outline">
            <a href={`/${locale}`}>{pwaMessage(locale, "offlineHome")}</a>
          </Button>
        </div>
      </div>
    </main>
  );
}
