"use client";

import { useEffect, useState, type FormEvent } from "react";
import {
  Badge,
  Button,
  ErrorSummary,
  StatusMessage,
  Surface,
  TextField,
} from "@wlbp/ui-foundation";

export interface BookingPreviewCopy {
  readonly appointmentLabel: string;
  readonly customerNameDescription: string;
  readonly customerNameLabel: string;
  readonly errorSummaryTitle: string;
  readonly nameRequired: string;
  readonly previewLabel: string;
  readonly priceLabel: string;
  readonly status: string;
  readonly submitAction: string;
  readonly successMessage: string;
  readonly timezoneLabel: string;
}

export interface BookingPreviewProps {
  readonly copy: BookingPreviewCopy;
  readonly formattedDateTime: string;
  readonly formattedPrice: string;
  readonly timeZone: string;
}

export function BookingPreview({
  copy,
  formattedDateTime,
  formattedPrice,
  timeZone,
}: BookingPreviewProps) {
  const [customerName, setCustomerName] = useState("");
  const [error, setError] = useState<string>();
  const [status, setStatus] = useState<string>();

  useEffect(() => {
    if (error) {
      document.querySelector<HTMLElement>("#booking-error-summary")?.focus();
    }
  }, [error]);

  function submitPreview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus(undefined);

    if (customerName.trim().length === 0) {
      setError(copy.nameRequired);
      return;
    }

    setError(undefined);
    setStatus(copy.successMessage.replace("{name}", customerName.trim()));
  }

  return (
    <Surface as="section" className="booking-preview" labelledBy="preview-label">
      <div className="booking-preview__heading">
        <p id="preview-label">{copy.previewLabel}</p>
        <Badge tone="positive">{copy.status}</Badge>
      </div>

      <dl className="booking-preview__facts">
        <div>
          <dt>{copy.appointmentLabel}</dt>
          <dd>{formattedDateTime}</dd>
        </div>
        <div>
          <dt>{copy.timezoneLabel}</dt>
          <dd dir="ltr">{timeZone}</dd>
        </div>
        <div>
          <dt>{copy.priceLabel}</dt>
          <dd>{formattedPrice}</dd>
        </div>
      </dl>

      <form noValidate onSubmit={submitPreview}>
        {error === undefined ? null : (
          <ErrorSummary
            focusTarget
            id="booking-error-summary"
            title={copy.errorSummaryTitle}
          >
            <a href="#customer-name">{error}</a>
          </ErrorSummary>
        )}
        <TextField
          autoComplete="name"
          description={copy.customerNameDescription}
          error={error}
          id="customer-name"
          label={copy.customerNameLabel}
          name="customerName"
          onChange={(event) => setCustomerName(event.currentTarget.value)}
          required
          value={customerName}
        />
        <Button type="submit">{copy.submitAction}</Button>
        {status === undefined ? null : (
          <StatusMessage tone="positive">{status}</StatusMessage>
        )}
      </form>
    </Surface>
  );
}
