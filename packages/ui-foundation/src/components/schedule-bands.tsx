import type { ReactNode } from "react";

import { cn } from "../lib/cn.js";

/**
 * Dye set for service colours. Every dye holds at least 4.5:1 against white
 * text, in both themes. Index 0 is the tenant's own primary.
 */
const dyes = [
  "var(--primary)",
  "oklch(0.42 0.1 262)",
  "oklch(0.45 0.08 152)",
  "oklch(0.47 0.1 58)",
  "oklch(0.44 0.07 205)",
  "oklch(0.42 0.11 335)",
] as const;

export type BandSegmentState =
  "confirmed" | "requested" | "completed" | "cancelled" | "blocked";

export interface BandLane {
  readonly id: string;
  readonly label: string;
  readonly sublabel?: string;
}

export interface BandSegment {
  readonly id: string;
  readonly laneId: string;
  /** Minutes since the start of the displayed civil day. */
  readonly startMinute: number;
  readonly endMinute: number;
  readonly title: string;
  readonly subtitle?: string;
  /** Accessible full description, e.g. "09:00–09:45, Haircut, Confirmed". */
  readonly description: string;
  readonly href?: string;
  readonly state: BandSegmentState;
  /** Stable index into the dye set, usually derived from the service id. */
  readonly dye?: number;
}

/** The dye colour (CSS value) for a service key: the same colour on bands, lists and catalogue. */
export function serviceDyeColor(serviceKey: string): string {
  return dyes[dyeIndexFor(serviceKey) % dyes.length]!;
}

/** A small decorative dot in a service's dye; the service name next to it carries the meaning. */
export function ServiceDyeDot({
  serviceKey,
  className,
}: {
  serviceKey: string;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-block size-2.5 shrink-0 rounded-full bg-(--dye)",
        className,
      )}
      style={{ ["--dye" as string]: serviceDyeColor(serviceKey) }}
    />
  );
}

/** Deterministic dye index for an id, so a service keeps its colour everywhere. */
export function dyeIndexFor(id: string): number {
  let hash = 0;
  for (const character of id) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return hash % dyes.length;
}

function percent(minute: number, start: number, end: number): number {
  return Math.min(100, Math.max(0, ((minute - start) / (end - start)) * 100));
}

function SegmentBody({ segment }: { segment: BandSegment }) {
  return (
    <>
      <span dir="auto" className="block truncate text-xs leading-tight font-semibold">
        {segment.title}
      </span>
      {segment.subtitle ? (
        <span
          dir="auto"
          className="block truncate text-[0.6875rem] leading-tight opacity-85"
        >
          {segment.subtitle}
        </span>
      ) : null}
    </>
  );
}

/**
 * The Sadu Band schedule: each lane is a woven band, each booking a dyed
 * segment. Time runs in reading direction (right-to-left in Arabic). The list
 * beneath is the accessible alternative and is always rendered.
 */
export function ScheduleBands({
  lanes,
  segments,
  startMinute,
  endMinute,
  hourLabel,
  nowMinute,
  nowLabel,
  label,
  emptyLaneLabel,
  listAlternative,
  className,
}: {
  lanes: readonly BandLane[];
  segments: readonly BandSegment[];
  startMinute: number;
  endMinute: number;
  /** Formats a whole hour (minute offset) for the axis, e.g. "9:00" / "٩:٠٠ ص". */
  hourLabel: (minute: number) => string;
  nowMinute?: number;
  nowLabel?: string;
  label: string;
  emptyLaneLabel: string;
  /** The ordered list alternative; always rendered beneath the bands. */
  listAlternative?: ReactNode;
  className?: string;
}) {
  const hours: number[] = [];
  for (
    let minute = Math.ceil(startMinute / 60) * 60;
    minute <= endMinute;
    minute += 60
  ) {
    hours.push(minute);
  }
  const showNow =
    nowMinute !== undefined && nowMinute >= startMinute && nowMinute <= endMinute;

  return (
    <div className={cn("grid gap-4", className)}>
      <div
        role="group"
        aria-label={label}
        tabIndex={0}
        className="overflow-x-auto rounded-lg border bg-card max-md:[mask-image:linear-gradient(to_right,black_calc(100%-2.5rem),transparent)] max-md:rtl:[mask-image:linear-gradient(to_left,black_calc(100%-2.5rem),transparent)]"
      >
        <div aria-hidden="true" className="sadu-teeth text-primary" />
        <div className="min-w-[36rem] md:min-w-[44rem]">
          <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] md:grid-cols-[10rem_minmax(0,1fr)] border-b bg-neutral-1">
            <div />
            <div className="relative h-8">
              {hours.map((minute) => (
                <span
                  key={minute}
                  className="absolute top-1/2 -translate-y-1/2 text-[0.6875rem] font-medium text-muted-foreground [font-variant-numeric:tabular-nums] ltr:-translate-x-1/2 rtl:translate-x-1/2"
                  style={{
                    insetInlineStart: `${percent(minute, startMinute, endMinute)}%`,
                  }}
                >
                  {hourLabel(minute)}
                </span>
              ))}
            </div>
          </div>
          {lanes.map((lane) => {
            const laneSegments = segments.filter(
              (segment) => segment.laneId === lane.id,
            );
            return (
              <div
                key={lane.id}
                className="grid grid-cols-[7.5rem_minmax(0,1fr)] md:grid-cols-[10rem_minmax(0,1fr)] border-b last:border-b-0"
              >
                <div className="grid content-center gap-0.5 border-e px-4 py-3">
                  <span
                    dir="auto"
                    className="line-clamp-2 text-sm leading-snug font-semibold break-words"
                  >
                    {lane.label}
                  </span>
                  {lane.sublabel ? (
                    <span dir="auto" className="truncate text-xs text-muted-foreground">
                      {lane.sublabel}
                    </span>
                  ) : null}
                </div>
                <div
                  className="relative h-[4.25rem] bg-[repeating-linear-gradient(to_right,transparent_0,transparent_calc(100%/var(--hours)-1px),var(--border)_calc(100%/var(--hours)-1px),var(--border)_calc(100%/var(--hours)))] rtl:bg-[repeating-linear-gradient(to_left,transparent_0,transparent_calc(100%/var(--hours)-1px),var(--border)_calc(100%/var(--hours)-1px),var(--border)_calc(100%/var(--hours)))]"
                  style={{
                    ["--hours" as string]: String(
                      Math.max(1, (endMinute - startMinute) / 60),
                    ),
                  }}
                >
                  {laneSegments.length === 0 ? (
                    <span className="absolute inset-0 grid place-items-center text-xs text-muted-foreground/80">
                      {emptyLaneLabel}
                    </span>
                  ) : null}
                  {laneSegments.map((segment) => {
                    const start = percent(segment.startMinute, startMinute, endMinute);
                    const width = Math.max(
                      1.5,
                      percent(segment.endMinute, startMinute, endMinute) - start,
                    );
                    const dye = dyes[(segment.dye ?? 0) % dyes.length];
                    const stateClass = {
                      confirmed: "bg-(--dye) text-white",
                      completed: "bg-(--dye) text-white opacity-70",
                      requested:
                        "sadu-weave border border-dashed border-(--dye) bg-card text-(--dye) dark:text-foreground",
                      cancelled:
                        "border border-destructive/40 bg-card text-muted-foreground line-through",
                      blocked: "sadu-weave bg-neutral-2 text-muted-foreground",
                    }[segment.state];
                    const classes = cn(
                      "absolute inset-y-2 grid min-w-0 content-center overflow-hidden rounded-md px-2 text-start outline-none focus-visible:ring-[3px] focus-visible:ring-ring",
                      stateClass,
                    );
                    const style = {
                      insetInlineStart: `${start}%`,
                      width: `${width}%`,
                      ["--dye" as string]: dye,
                    };
                    return segment.href ? (
                      <a
                        key={segment.id}
                        href={segment.href}
                        className={cn(
                          classes,
                          "transition-transform hover:-translate-y-px",
                        )}
                        style={style}
                        title={segment.description}
                        aria-label={segment.description}
                      >
                        <SegmentBody segment={segment} />
                      </a>
                    ) : (
                      <div
                        key={segment.id}
                        className={classes}
                        style={style}
                        title={segment.description}
                      >
                        <SegmentBody segment={segment} />
                      </div>
                    );
                  })}
                  {showNow ? (
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-y-0 w-0.5 bg-primary"
                      style={{
                        insetInlineStart: `${percent(nowMinute!, startMinute, endMinute)}%`,
                      }}
                    />
                  ) : null}
                </div>
              </div>
            );
          })}
          {showNow && nowLabel ? (
            <p className="border-t px-4 py-2 text-xs text-muted-foreground">
              <span
                aria-hidden="true"
                className="me-2 inline-block size-2 rounded-full bg-primary align-middle"
              />
              {nowLabel}
            </p>
          ) : null}
        </div>
      </div>
      {listAlternative}
    </div>
  );
}
