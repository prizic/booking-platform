"use client";

import { CircleAlert, CircleCheck, LoaderCircle, X } from "lucide-react";
import { useSyncExternalStore, type CSSProperties } from "react";
import { Toaster } from "sonner";

import type { FormLocale } from "../forms/messages.js";

const labels: Record<FormLocale, { region: string; close: string }> = {
  en: { region: "Notifications", close: "Close notification" },
  ar: { region: "الإشعارات", close: "إغلاق الإشعار" },
};

const NARROW = "(max-width: 40rem)";

function subscribeNarrow(onChange: () => void): () => void {
  const media = window.matchMedia(NARROW);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

/**
 * Sonner styles its toasts with its own unlayered stylesheet; these custom
 * properties point that stylesheet at the theme tokens (light and dark follow
 * the document), so no component CSS is added.
 */
const tokenStyle = {
  "--normal-bg": "var(--card)",
  "--normal-border": "var(--border)",
  "--normal-text": "var(--foreground)",
  "--gray2": "var(--muted)",
  "--gray5": "var(--border-strong)",
  "--gray11": "var(--muted-foreground)",
  "--border-radius": "min(var(--radius-surface), 1rem)",
  fontFamily: "var(--font-active)",
} as CSSProperties;

/**
 * The one toast region of an app: mount it once, outside `<main>`, in the
 * locale layout. Toasts sit at the bottom inline-end corner (bottom-left in
 * Arabic) and at the top centre on narrow screens; at most three are visible.
 * Motion follows the reduced-motion preference (sonner's own stylesheet and the
 * theme's global rule both remove it).
 */
export function AppToaster({ locale }: { locale: FormLocale }) {
  const narrow = useSyncExternalStore(
    subscribeNarrow,
    () => window.matchMedia(NARROW).matches,
    () => false,
  );
  const dir = locale === "ar" ? "rtl" : "ltr";
  const text = labels[locale];
  return (
    <Toaster
      dir={dir}
      position={narrow ? "top-center" : dir === "rtl" ? "bottom-left" : "bottom-right"}
      visibleToasts={3}
      closeButton
      containerAriaLabel={text.region}
      customAriaLabel={text.region}
      className="pointer-events-auto"
      style={tokenStyle}
      icons={{
        loading: (
          <LoaderCircle
            aria-hidden="true"
            className="size-4 animate-spin text-muted-foreground motion-reduce:animate-none"
          />
        ),
        success: <CircleCheck aria-hidden="true" className="size-4 text-success-ink" />,
        error: (
          <CircleAlert aria-hidden="true" className="size-4 text-destructive-ink" />
        ),
        close: <X aria-hidden="true" className="size-3.5" />,
      }}
      toastOptions={{
        closeButtonAriaLabel: text.close,
        classNames: {
          toast: "text-sm! shadow-md!",
          success: "text-foreground",
          error: "text-foreground",
          closeButton: "size-6!",
        },
      }}
    />
  );
}
