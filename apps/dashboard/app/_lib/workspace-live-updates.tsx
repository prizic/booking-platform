"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@wlbp/supabase-client/browser";
import type { Locale } from "@wlbp/i18n";
import { isBookingInvalidation } from "./workspace-live-events";
const labels = {
  en: {
    connecting: "Connecting live updates…",
    connected: "Live updates connected",
    unavailable: "Live updates unavailable. Refresh to check for changes.",
    reconnecting: "Reconnecting live updates…",
    refused: "Access must be checked again. Protected content is hidden.",
    refresh: "Refresh workspace",
  },
  ar: {
    connecting: "جارٍ الاتصال بالتحديثات المباشرة…",
    connected: "التحديثات المباشرة متصلة",
    unavailable: "التحديثات المباشرة غير متاحة. حدّث الصفحة للتحقق من التغييرات.",
    reconnecting: "جارٍ إعادة الاتصال بالتحديثات المباشرة…",
    refused: "يجب التحقق من الصلاحيات مجدداً. تم إخفاء المحتوى المحمي.",
    refresh: "تحديث مساحة العمل",
  },
} as const;
export function WorkspaceLiveUpdates({
  tenantId,
  locale,
  configuration,
  enabled,
  children,
}: {
  tenantId: string;
  locale: Locale;
  configuration: { url: string; publishableKey: string };
  enabled: boolean;
  children: ReactNode;
}) {
  const router = useRouter();
  const [accessRefused, setAccessRefused] = useState(false);
  const recheckAccess = useRef<(() => Promise<void>) | null>(null);
  const [state, setState] = useState<keyof Omit<typeof labels.en, "refresh">>(
    enabled ? "connecting" : "unavailable",
  );
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let connected = false;
    let checkSequence = 0;
    let disconnecting:
      | ReturnType<
          ReturnType<typeof createBrowserSupabaseClient>["realtime"]["disconnect"]
        >
      | undefined;
    let client: ReturnType<typeof createBrowserSupabaseClient>;
    try {
      client = createBrowserSupabaseClient({
        url: configuration.url,
        publishableKey: configuration.publishableKey,
      });
    } catch {
      const failed = setTimeout(() => setState("unavailable"), 0);
      return () => clearTimeout(failed);
    }
    const refresh = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        if (active) router.refresh();
      }, 250);
    };
    const recheck = async () => {
      const sequence = ++checkSequence;
      const { data, error } = await client
        .schema("api_v1")
        .rpc("get_dashboard_context_v1", { p_tenant_id: tenantId });
      if (!active || sequence !== checkSequence) return;
      if (error || !data || (Array.isArray(data) && data.length === 0)) {
        setAccessRefused(true);
        router.refresh();
      } else setAccessRefused(false);
    };
    recheckAccess.current = recheck;
    const channel = client
      .channel(`tenant:${tenantId}`, {
        config: { private: true, broadcast: { self: false } },
      })
      .on("broadcast", { event: "booking_changed" }, (message) => {
        if (isBookingInvalidation(message.payload)) refresh();
      })
      .subscribe((status) => {
        if (!active) return;
        if (status === "SUBSCRIBED") {
          setState("connected");
          if (connected) refresh();
          connected = true;
          void recheck();
        } else if (status === "CHANNEL_ERROR") {
          setState("unavailable");
          void recheck();
        } else if (status === "TIMED_OUT" || status === "CLOSED")
          setState(connected && navigator.onLine ? "reconnecting" : "unavailable");
      });
    const { data: auth } = client.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT" && active) {
        ++checkSequence;
        setAccessRefused(true);
        router.refresh();
      }
    });
    const check = setInterval(() => void recheck(), 60000);
    const focus = () => {
      void recheck();
      refresh();
    };
    const offline = () => {
      setState("unavailable");
      disconnecting = client.realtime.disconnect();
    };
    const online = () => {
      // Rejoining is owned by the transport; never claim connected from a
      // browser network event. Refresh and re-authorize once connectivity returns.
      setState("reconnecting");
      void (async () => {
        await disconnecting;
        if (!active) return;
        client.realtime.connect();
        void recheck();
        refresh();
      })();
    };
    window.addEventListener("focus", focus);
    window.addEventListener("offline", offline);
    window.addEventListener("online", online);
    return () => {
      active = false;
      recheckAccess.current = null;
      if (timer) clearTimeout(timer);
      clearInterval(check);
      window.removeEventListener("focus", focus);
      window.removeEventListener("offline", offline);
      window.removeEventListener("online", online);
      auth.subscription.unsubscribe();
      void client.removeChannel(channel);
    };
  }, [
    tenantId,
    locale,
    configuration.url,
    configuration.publishableKey,
    enabled,
    router,
  ]);
  return (
    <>
      <div className="workspace-live-status">
        <p role="status">{labels[locale][accessRefused ? "refused" : state]}</p>
        <button
          type="button"
          className="wlbp-button wlbp-button--quiet"
          onClick={() => {
            void recheckAccess.current?.();
            router.refresh();
          }}
        >
          {labels[locale].refresh}
        </button>
      </div>
      {accessRefused ? null : children}
    </>
  );
}
