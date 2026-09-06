import { formatDateTime, type Locale } from "@wlbp/i18n";
import { Button, StatusMessage } from "@wlbp/ui-foundation";

import type {
  AvailabilityNoSlotReasonV1,
  AvailabilitySlotV1,
} from "@wlbp/api-contracts";

import { availabilitySlotIdentity } from "./availability-picker-state";

export interface AvailabilityResultsCopy {
  readonly advisory: string;
  readonly empty: string;
  readonly emptyAction: string;
  readonly locationTimeZone: string;
  readonly noSlotReasons: Readonly<Record<AvailabilityNoSlotReasonV1, string>>;
  readonly results: string;
  readonly select: string;
  readonly selected: string;
}

interface AvailabilityResultsProps {
  readonly copy: AvailabilityResultsCopy;
  readonly displayTimeZone: string;
  readonly locale: Locale;
  readonly noSlotReason: AvailabilityNoSlotReasonV1 | null;
  readonly onSelect: (slot: AvailabilitySlotV1) => void;
  readonly selectedSlot: AvailabilitySlotV1 | null;
  readonly serviceTimeZone: string;
  readonly slots: readonly AvailabilitySlotV1[];
}

export function AvailabilityResults({
  copy,
  displayTimeZone,
  locale,
  noSlotReason,
  onSelect,
  selectedSlot,
  serviceTimeZone,
  slots,
}: AvailabilityResultsProps) {
  if (slots.length === 0) {
    return (
      <div className="availability-empty">
        <p>{noSlotReason === null ? copy.empty : copy.noSlotReasons[noSlotReason]}</p>
        <p>{copy.emptyAction}</p>
      </div>
    );
  }

  return (
    <section aria-labelledby="availability-results-title">
      <div className="availability-results__heading">
        <h3 id="availability-results-title">{copy.results}</h3>
        <span>
          {copy.locationTimeZone}: <bdi>{serviceTimeZone}</bdi>
        </span>
      </div>
      <StatusMessage className="availability-advisory" tone="warning">
        {copy.advisory}
      </StatusMessage>
      <ol className="availability-slots">
        {slots.map((slot) => {
          const selected =
            selectedSlot !== null &&
            availabilitySlotIdentity(slot) === availabilitySlotIdentity(selectedSlot);
          return (
            <li key={availabilitySlotIdentity(slot)}>
              <time dateTime={slot.startAt}>
                {formatDateTime(slot.startAt, locale, displayTimeZone)}
              </time>
              <Button
                aria-pressed={selected}
                onClick={() => onSelect(slot)}
                variant={selected ? "primary" : "secondary"}
              >
                {selected ? copy.selected : copy.select}
              </Button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
