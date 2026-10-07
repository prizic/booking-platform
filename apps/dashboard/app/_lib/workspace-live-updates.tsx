"use client";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { Alert, AlertDescription, Button, cn } from "@wlbp/ui-foundation";
import { createBrowserSupabaseClient } from "@wlbp/supabase-client/browser";
import type { Locale } from "@wlbp/i18n";
import { isBookingInvalidation } from "./workspace-live-events";
import { workspaceMessage } from "./workspace-copy";
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
    refused: "يجب التحقق من الصلاحيات مجدداً، لذلك أُخفي المحتوى المحمي.",
    refresh: "تحديث مساحة العمل",
  },
} as const;
type LiveState = "connecting" | "connected" | "unavailable" | "reconnecting";
/**
 * How long "connecting" may last before the status settles as unavailable. A
 * channel that cannot join (Realtime off, socket blocked, no session) must not
 * read as "connecting" forever; Refresh still works.
 */
const SETTLE_AFTER_MS = 10_000;
const shortLabel = {
  connecting: "liveConnecting",
  connected: "liveConnected",
  unavailable: "liveUnavailable",
  reconnecting: "liveReconnecting",
  refused: "liveRefused",
} as const;
interface LiveContext {
  readonly locale: Locale;
  readonly state: LiveState;
  readonly accessRefused: boolean;
  readonly refresh: () => void;
}
const LiveUpdatesContext = createContext<LiveContext | null>(null);

/**
 * Owns the realtime subscription for the operations screens. Its status and
 * refresh control render in the top bar (WorkspaceLiveStatus); protected
 * content renders through WorkspaceLiveGate, which hides it as soon as access
 * must be checked again.
 */
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
  const [state, setState] = useState<LiveState>(enabled ? "connecting" : "unavailable");
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let settle: ReturnType<typeof setTimeout> | undefined;
    let connected = false;
    let subscribed = false;
    // Any attempt to (re)join gets a deadline; only SUBSCRIBED clears it.
    const settleSoon = () => {
      if (settle) clearTimeout(settle);
      settle = setTimeout(() => {
        if (active && !subscribed) setState("unavailable");
      }, SETTLE_AFTER_MS);
    };
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
    const topic = `tenant:${tenantId}`;
    let channel: ReturnType<typeof client.channel> | null = null;
    settleSoon();
    // The browser client is a singleton, and `channel()` hands back an existing
    // channel with the same topic. After a remount (a client-side navigation
    // between live screens, or React's development double effect) the previous
    // channel is still leaving; subscribing to it is a no-op whose callback
    // never fires, which left the status on "Connecting" forever. Finish
    // removing any previous channel first, then join a fresh one.
    const stale = client
      .getChannels()
      .filter((existing) => existing.topic === `realtime:${topic}`);
    void Promise.allSettled(
      stale.map((existing) => client.removeChannel(existing)),
    ).then(() => {
      if (!active) return;
      channel = client
        .channel(topic, {
          config: { private: true, broadcast: { self: false } },
        })
        .on("broadcast", { event: "booking_changed" }, (message) => {
          if (isBookingInvalidation(message.payload)) refresh();
        })
        .subscribe((status) => {
          if (!active) return;
          if (status === "SUBSCRIBED") {
            subscribed = true;
            if (settle) clearTimeout(settle);
            setState("connected");
            if (connected) refresh();
            connected = true;
            void recheck();
          } else if (status === "CHANNEL_ERROR") {
            subscribed = false;
            setState("unavailable");
            void recheck();
          } else if (status === "TIMED_OUT" || status === "CLOSED") {
            subscribed = false;
            if (connected && navigator.onLine) {
              setState("reconnecting");
              settleSoon();
            } else setState("unavailable");
          }
        });
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
      subscribed = false;
      if (settle) clearTimeout(settle);
      setState("unavailable");
      disconnecting = client.realtime.disconnect();
    };
    const online = () => {
      // Rejoining is owned by the transport; never claim connected from a
      // browser network event. Refresh and re-authorize once connectivity returns.
      setState("reconnecting");
      settleSoon();
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
      if (settle) clearTimeout(settle);
      clearInterval(check);
      window.removeEventListener("focus", focus);
      window.removeEventListener("offline", offline);
      window.removeEventListener("online", online);
      auth.subscription.unsubscribe();
      if (channel) void client.removeChannel(channel);
    };
  }, [
    tenantId,
    locale,
    configuration.url,
    configuration.publishableKey,
    enabled,
    router,
  ]);
  const refreshNow = () => {
    void recheckAccess.current?.();
    router.refresh();
  };
  return (
    <LiveUpdatesContext.Provider
      value={{ locale, state, accessRefused, refresh: refreshNow }}
    >
      {children}
    </LiveUpdatesContext.Provider>
  );
}

const dotTone: Record<LiveState | "refused", string> = {
  connected: "bg-success",
  connecting: "animate-pulse bg-warning",
  reconnecting: "animate-pulse bg-warning",
  unavailable: "bg-muted-foreground",
  refused: "bg-destructive",
};

/** Compact live-update status and refresh control for the top bar. */
export function WorkspaceLiveStatus() {
  const live = useContext(LiveUpdatesContext);
  if (live === null) return null;
  const key = live.accessRefused ? "refused" : live.state;
  const text = labels[live.locale];
  return (
    <div className="flex items-center gap-1.5">
      <span
        aria-hidden="true"
        className={cn("size-2 shrink-0 rounded-full", dotTone[key])}
      />
      <span
        aria-hidden="true"
        title={text[key]}
        className="text-xs font-semibold whitespace-nowrap text-muted-foreground"
      >
        {workspaceMessage(live.locale, shortLabel[key])}
      </span>
      <p role="status" className="sr-only">
        {text[key]}
      </p>
      <Button
        variant="ghost"
        size="icon"
        aria-label={text.refresh}
        title={text.refresh}
        onClick={live.refresh}
      >
        <RefreshCw aria-hidden="true" />
      </Button>
    </div>
  );
}

/** Renders protected content only while access is still confirmed. */
export function WorkspaceLiveGate({ children }: { children: ReactNode }) {
  const live = useContext(LiveUpdatesContext);
  if (live === null || !live.accessRefused) return <>{children}</>;
  return (
    <Alert tone="warning">
      <AlertDescription className="text-foreground">
        {labels[live.locale].refused}
      </AlertDescription>
    </Alert>
  );
}
