import type { AvailabilitySlotV1, AvailabilityV1Response } from "@wlbp/api-contracts";

export interface AvailabilityQuerySnapshot {
  readonly date: string;
  readonly partySize: number;
  readonly timeZone: string;
}

export function availabilitySlotIdentity(slot: AvailabilitySlotV1): string {
  return JSON.stringify([slot.startAt, slot.endAt, slot.allocationKind, slot.staffId]);
}

export interface AvailabilityPickerState {
  readonly activeRequestId: number | null;
  readonly activeSnapshot: AvailabilityQuerySnapshot | null;
  readonly failed: boolean;
  readonly filters: AvailabilityQuerySnapshot;
  readonly loading: boolean;
  readonly result:
    | Readonly<{
        response: AvailabilityV1Response;
        snapshot: AvailabilityQuerySnapshot;
      }>
    | undefined;
  readonly selected: AvailabilitySlotV1 | undefined;
}

export function initialAvailabilityPickerState(
  timeZone: string,
): AvailabilityPickerState {
  return {
    activeRequestId: null,
    activeSnapshot: null,
    failed: false,
    filters: { date: "", partySize: 1, timeZone },
    loading: false,
    result: undefined,
    selected: undefined,
  };
}

export type AvailabilityPickerAction =
  | {
      readonly field: "date" | "timeZone";
      readonly type: "filterChanged";
      readonly value: string;
    }
  | {
      readonly field: "partySize";
      readonly type: "filterChanged";
      readonly value: number;
    }
  | {
      readonly requestId: number;
      readonly snapshot: AvailabilityQuerySnapshot;
      readonly type: "submitted";
    }
  | {
      readonly requestId: number;
      readonly response: AvailabilityV1Response;
      readonly type: "resolved";
    }
  | { readonly requestId: number; readonly type: "rejected" }
  | { readonly slot: AvailabilitySlotV1; readonly type: "selected" };

export function availabilityPickerReducer(
  state: AvailabilityPickerState,
  action: AvailabilityPickerAction,
): AvailabilityPickerState {
  switch (action.type) {
    case "filterChanged":
      return {
        ...state,
        activeRequestId: null,
        activeSnapshot: null,
        failed: false,
        filters: { ...state.filters, [action.field]: action.value },
        loading: false,
        result: undefined,
        selected: undefined,
      };
    case "submitted":
      return {
        ...state,
        activeRequestId: action.requestId,
        activeSnapshot: Object.freeze({ ...action.snapshot }),
        failed: false,
        loading: true,
        result: undefined,
        selected: undefined,
      };
    case "resolved":
      if (action.requestId !== state.activeRequestId || state.activeSnapshot === null) {
        return state;
      }
      return {
        ...state,
        activeRequestId: null,
        activeSnapshot: null,
        failed: false,
        loading: false,
        result: {
          response: action.response,
          snapshot: state.activeSnapshot,
        },
      };
    case "rejected":
      if (action.requestId !== state.activeRequestId) return state;
      return {
        ...state,
        activeRequestId: null,
        activeSnapshot: null,
        failed: true,
        loading: false,
        result: undefined,
        selected: undefined,
      };
    case "selected":
      return state.result === undefined ? state : { ...state, selected: action.slot };
  }
}
