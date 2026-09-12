"use client";

// Issue #102. The browser half of the workspace broadcast.
//
// It subscribes to the tenant's private topic with the member's own session and
// asks Next to re-run the server read. It renders nothing from the message —
// the decision about what a message means lives in `live-updates.ts`, and the
// only thing this component does with a payload is hand it over.
//
// The status line is not decoration. A workspace that silently stops updating
// looks identical to a quiet day, and an operator making decisions from a stale
// screen is the failure this whole feature exists to prevent.
import type { Locale } from "@wlbp/i18n";
import { createBrowserSupabaseClient } from "@wlbp/supabase-client/browser";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { getDashboardMessage } from "./copy";
import {
  initialLiveState,
  reduceLive,
  type LiveEvent,
  type LiveStatus,
} from "./live-updates";

export interface LiveUpdatesListenerProps {
  readonly locale: Locale;
  readonly publishableKey: string;
  readonly supabaseUrl: string;
  readonly tenantId: string;
}

/** A refused subscription and a dropped one look alike until you read the error. */
function classify(status: string, error: Error | undefined): LiveEvent["kind"] {
  if (status === "SUBSCRIBED") return "subscribed";
  if (
    status === "CHANNEL_ERROR" &&
    /unauthor|forbidden|denied/iu.test(error?.message ?? "")
  ) {
    return "refused";
  }
  return "disconnected";
}

export function LiveUpdatesListener({
  locale,
  publishableKey,
  supabaseUrl,
  tenantId,
}: LiveUpdatesListenerProps) {
  const router = useRouter();
  const [status, setStatus] = useState<LiveStatus>("connecting");
  // The reducer state lives in a ref rather than in React state: a duplicate
  // message must be recognised the moment it arrives, not after a render.
  const stateRef = useRef(initialLiveState);

  useEffect(() => {
    const client = createBrowserSupabaseClient({ publishableKey, url: supabaseUrl });
    let cancelled = false;

    const apply = (event: LiveEvent) => {
      if (cancelled) return;
      const transition = reduceLive(stateRef.current, event);
      stateRef.current = transition.state;
      setStatus(transition.state.status);
      // Everything the operator sees comes from the tenant's own read, which
      // re-runs under their own session and their own location scope.
      if (transition.refetch) router.refresh();
    };

    const channel = client
      .channel(`tenant:${tenantId}`, { config: { private: true } })
      .on("broadcast", { event: "booking_changed" }, (message) => {
        apply({ kind: "message", payload: message["payload"] });
      })
      .subscribe((subscriptionStatus, error) => {
        apply({ kind: classify(subscriptionStatus, error) } as LiveEvent);
      });

    return () => {
      cancelled = true;
      void client.removeChannel(channel);
    };
  }, [publishableKey, router, supabaseUrl, tenantId]);

  const label =
    status === "ended"
      ? getDashboardMessage(locale, "liveStatusEnded")
      : status === "reconnecting"
        ? getDashboardMessage(locale, "liveStatusReconnecting")
        : status === "live"
          ? getDashboardMessage(locale, "liveStatusLive")
          : getDashboardMessage(locale, "liveStatusConnecting");

  return (
    <p
      aria-live="polite"
      className="dashboard-live-status"
      data-live-status={status}
      data-testid="live-status"
    >
      {label}
    </p>
  );
}
