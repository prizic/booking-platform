"use client";

import { useState } from "react";
import { Badge, ToggleGroup, ToggleGroupItem, cn } from "@wlbp/ui-foundation";

export interface ScheduleItem {
  readonly dateTime: string;
  readonly description: string;
  readonly displayTime: string;
  readonly status: string;
  readonly tone: "neutral" | "positive" | "warning" | "danger";
}

export interface SchedulePreviewProps {
  readonly gridViewLabel: string;
  readonly listAlternativeLabel: string;
  readonly listViewLabel: string;
  readonly scheduleTitle: string;
  readonly items: readonly ScheduleItem[];
  readonly timeZone: string;
  readonly timeZoneLabel: string;
  readonly viewChangedGrid: string;
  readonly viewChangedList: string;
  readonly viewSelectorLabel: string;
}

export function SchedulePreview({
  gridViewLabel,
  items,
  listAlternativeLabel,
  listViewLabel,
  scheduleTitle,
  timeZone,
  timeZoneLabel,
  viewChangedGrid,
  viewChangedList,
  viewSelectorLabel,
}: SchedulePreviewProps) {
  const [view, setView] = useState<"grid" | "list">("grid");

  return (
    <section
      aria-labelledby="schedule-title"
      className="grid gap-4 rounded-lg border bg-card p-5"
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid gap-1">
          <h2 id="schedule-title" className="text-lg font-semibold">
            {scheduleTitle}
          </h2>
          <p className="text-sm text-muted-foreground">
            {timeZoneLabel}: <bdi>{timeZone}</bdi>
          </p>
        </div>
        <ToggleGroup
          type="single"
          value={view}
          onValueChange={(value) => {
            if (value === "grid" || value === "list") setView(value);
          }}
          aria-label={viewSelectorLabel}
        >
          <ToggleGroupItem value="grid" aria-controls="schedule-items" className="h-11">
            {gridViewLabel}
          </ToggleGroupItem>
          <ToggleGroupItem value="list" aria-controls="schedule-items" className="h-11">
            {listViewLabel}
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      <p role="status" className="sr-only">
        {view === "grid" ? viewChangedGrid : viewChangedList}
      </p>
      <ol
        aria-label={listAlternativeLabel}
        className={cn(
          "gap-3",
          view === "grid" ? "grid sm:grid-cols-2 lg:grid-cols-3" : "grid divide-y",
        )}
        id="schedule-items"
      >
        {items.map((item) => (
          <li
            key={item.dateTime}
            className={cn(
              "grid gap-2",
              view === "grid"
                ? "rounded-md border p-3"
                : "py-3 sm:grid-cols-[8rem_1fr_auto]",
            )}
          >
            <time dateTime={item.dateTime} className="text-sm font-semibold">
              {item.displayTime}
            </time>
            <p className="text-sm">{item.description}</p>
            <Badge
              tone={
                item.tone === "positive"
                  ? "positive"
                  : item.tone === "warning"
                    ? "warning"
                    : item.tone === "danger"
                      ? "danger"
                      : "neutral"
              }
            >
              {item.status}
            </Badge>
          </li>
        ))}
      </ol>
    </section>
  );
}
