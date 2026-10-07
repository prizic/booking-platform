"use client";

import type { Locale } from "@wlbp/i18n";
import { Alert, AlertDescription, AlertTitle, Button } from "@wlbp/ui-foundation";
import { useEffect, useRef, useState } from "react";

interface PwaRegistrationProps {
  /** The instance default locale: the offline page language for `/`. */
  readonly defaultLocale: Locale;
  readonly labels: {
    readonly title: string;
    readonly body: string;
    readonly accept: string;
    readonly dismiss: string;
  };
  /** Build version; a new value installs a new worker with new cache names. */
  readonly version: string;
}

/**
 * Registers /sw.js in production on secure origins only. A new version never
 * takes over by itself: it waits until the person accepts the update prompt,
 * so nobody loses a half-filled form to a surprise reload.
 */
export function PwaRegistration({
  defaultLocale,
  labels,
  version,
}: PwaRegistrationProps) {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const accepted = useRef(false);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!window.isSecureContext || !("serviceWorker" in navigator)) return;
    const container = navigator.serviceWorker;

    const onControllerChange = () => {
      // Only the worker the person accepted may reload the page.
      if (accepted.current) window.location.reload();
    };
    container.addEventListener("controllerchange", onControllerChange);

    let cancelled = false;
    const script = `/sw.js?v=${encodeURIComponent(version)}&l=${defaultLocale}`;
    container
      .register(script, { scope: "/" })
      .then((registration) => {
        if (cancelled) return;
        const offer = (worker: ServiceWorker | null) => {
          // Without a controller this is the first install, not an update.
          if (worker && container.controller) setWaiting(worker);
        };
        offer(registration.waiting);
        registration.addEventListener("updatefound", () => {
          const installing = registration.installing;
          installing?.addEventListener("statechange", () => {
            if (installing.state === "installed") offer(installing);
          });
        });
      })
      .catch(() => {
        // The site works without the worker; registration is an enhancement.
      });

    return () => {
      cancelled = true;
      container.removeEventListener("controllerchange", onControllerChange);
    };
  }, [defaultLocale, version]);

  if (waiting === null) return null;

  return (
    <div className="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-md">
      <Alert tone="info" className="bg-card shadow-lg">
        <AlertTitle>{labels.title}</AlertTitle>
        <AlertDescription className="grid gap-3">
          <span>{labels.body}</span>
          <span className="flex flex-wrap gap-2">
            <Button
              size="sm"
              onClick={() => {
                accepted.current = true;
                waiting.postMessage({ type: "SKIP_WAITING" });
              }}
            >
              {labels.accept}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setWaiting(null)}>
              {labels.dismiss}
            </Button>
          </span>
        </AlertDescription>
      </Alert>
    </div>
  );
}
