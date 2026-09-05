"use client";

import { useState } from "react";
import { Badge, Button, StatusMessage, Surface } from "@wlbp/ui-foundation";

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
    <Surface as="section" className="schedule" labelledBy="schedule-title">
      <div className="schedule-heading">
        <div>
          <p>{listAlternativeLabel}</p>
          <h2 id="schedule-title">{scheduleTitle}</h2>
          <span className="schedule-timezone">
            {timeZoneLabel}: <bdi>{timeZone}</bdi>
          </span>
        </div>
        <div aria-label={viewSelectorLabel} className="schedule-view-switch">
          <Button
            aria-controls="schedule-items"
            aria-pressed={view === "grid"}
            onClick={() => setView("grid")}
            variant="quiet"
          >
            {gridViewLabel}
          </Button>
          <Button
            aria-controls="schedule-items"
            aria-pressed={view === "list"}
            onClick={() => setView("list")}
            variant="quiet"
          >
            {listViewLabel}
          </Button>
        </div>
      </div>

      <StatusMessage className="schedule-view-status">
        {view === "grid" ? viewChangedGrid : viewChangedList}
      </StatusMessage>
      <ol
        aria-label={listAlternativeLabel}
        className={`schedule-items schedule-items--${view}`}
        id="schedule-items"
      >
        {items.map((item) => (
          <li key={item.dateTime}>
            <time dateTime={item.dateTime}>{item.displayTime}</time>
            <span aria-hidden="true" className="schedule-marker" />
            <p>{item.description}</p>
            <Badge tone={item.tone}>{item.status}</Badge>
          </li>
        ))}
      </ol>
    </Surface>
  );
}
