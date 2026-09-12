// Issue #102. What a workspace does with a broadcast, decided away from the
// browser so it can be tested without one.
//
// The rule the whole file exists to enforce: a message tells the workspace to
// refetch. It never tells it what to show. The envelope type below therefore
// carries only what deduplication needs, and the status the tenant's own read
// produced afterwards is the only thing that reaches the screen.
//
// Everything here is about the four ways a live connection lies: it drops
// without saying so, it comes back having missed things, it repeats itself, and
// it arrives out of order.

export type LiveStatus = "connecting" | "live" | "reconnecting" | "ended";

/** The only two fields anything reads off the wire. */
export interface BroadcastEnvelope {
  readonly bookingId: string;
  readonly bookingRevision: number;
}

export interface LiveState {
  /** Highest revision already accounted for, per booking. */
  readonly seen: ReadonlyMap<string, number>;
  readonly status: LiveStatus;
}

export type LiveEvent =
  | { readonly kind: "subscribed" }
  | { readonly kind: "message"; readonly payload: unknown }
  | { readonly kind: "disconnected" }
  | { readonly kind: "refused" };

export const initialLiveState: LiveState = { seen: new Map(), status: "connecting" };

// A tab left open for a week should not grow without bound. Oldest entries go
// first; re-seeing one only costs a refetch that was already safe to do.
// ponytail: fixed cap, revisit if a tenant routinely changes more than this
// many distinct bookings inside one session.
const seenLimit = 500;

/**
 * Read the two fields, or nothing. A payload that is not exactly what the
 * database sends is not partially trusted — it is ignored, because a refetch
 * driven by a malformed message is a refetch driven by whoever malformed it.
 */
export function parseEnvelope(payload: unknown): BroadcastEnvelope | null {
  if (payload === null || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  const bookingId = record["booking_id"];
  const bookingRevision = record["booking_revision"];
  if (typeof bookingId !== "string" || bookingId === "") return null;
  if (typeof bookingRevision !== "number" || !Number.isFinite(bookingRevision)) {
    return null;
  }
  return { bookingId, bookingRevision };
}

export interface LiveTransition {
  readonly refetch: boolean;
  readonly state: LiveState;
}

export function reduceLive(state: LiveState, event: LiveEvent): LiveTransition {
  // Losing access is terminal. A member removed from a tenant must not be
  // reconnected into its topic by a retry loop.
  if (state.status === "ended") return { refetch: false, state };

  switch (event.kind) {
    case "subscribed": {
      // Reconnecting is the interesting case: whatever happened while the
      // socket was down is unknowable, so the only honest response is to
      // refetch once. A first connection needs nothing — the server just
      // rendered the page.
      const refetch = state.status === "reconnecting";
      return { refetch, state: { ...state, status: "live" } };
    }
    case "disconnected":
      return { refetch: false, state: { ...state, status: "reconnecting" } };
    case "refused":
      return { refetch: false, state: { ...state, status: "ended" } };
    case "message": {
      const envelope = parseEnvelope(event.payload);
      if (envelope === null) return { refetch: false, state };
      const highest = state.seen.get(envelope.bookingId);
      // Covers duplicates and out-of-order arrivals with one comparison: a
      // revision we have already acted on, or an older one, changes nothing.
      if (highest !== undefined && highest >= envelope.bookingRevision) {
        return { refetch: false, state };
      }
      const seen = new Map(state.seen);
      seen.set(envelope.bookingId, envelope.bookingRevision);
      if (seen.size > seenLimit) {
        const oldest = seen.keys().next();
        if (!oldest.done) seen.delete(oldest.value);
      }
      return { refetch: true, state: { ...state, seen } };
    }
  }
}
