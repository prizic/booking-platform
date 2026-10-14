import { bookingStatusesV1, type BookingStatusDto } from "./booking-status.js";

export interface BookingContextV1 {
  readonly contractVersion: 1;
  readonly bookingId: string;
  readonly contactAccess: "allowed" | "restricted";
  readonly intake:
    | { readonly access: "restricted" }
    | {
        readonly access: "allowed";
        readonly schema: Readonly<Record<string, unknown>>;
        readonly answers: Readonly<Record<string, unknown>>;
      };
  readonly request: {
    readonly approvalStatus:
      "not_required" | "pending" | "approved" | "declined" | "expired";
    readonly approvalDeadline: string | null;
    readonly publicReason: string | null;
    readonly submittedAt: string;
  };
  readonly customer:
    | { readonly access: "restricted" }
    | {
        readonly access: "allowed";
        readonly customerId: string;
        readonly state: "active" | "restricted" | "erased";
        readonly history: readonly {
          readonly bookingId: string;
          readonly publicReference: string;
          readonly serviceName: string;
          readonly status: BookingStatusDto;
          readonly startAt: string;
          readonly endAt: string;
        }[];
      };
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error("booking_context_invalid");
  return value as Record<string, unknown>;
}
function text(value: unknown): string {
  if (typeof value !== "string" || value === "")
    throw new Error("booking_context_invalid");
  return value;
}
function instant(value: unknown): string {
  const result = text(value);
  if (!Number.isFinite(Date.parse(result))) throw new Error("booking_context_invalid");
  return result;
}
function oneOf<T extends string>(value: unknown, values: readonly T[]): T {
  if (typeof value !== "string" || !values.includes(value as T))
    throw new Error("booking_context_invalid");
  return value as T;
}

export function parseBookingContextV1(value: unknown): BookingContextV1 {
  const row = record(value);
  if (row.contractVersion !== 1) throw new Error("booking_context_invalid");
  const intake = record(row.intake);
  const customer = record(row.customer);
  const request = record(row.request);
  const intakeAccess = oneOf(intake.access, ["allowed", "restricted"]);
  const customerAccess = oneOf(customer.access, ["allowed", "restricted"]);
  if (
    (intakeAccess === "restricted" && Object.keys(intake).length !== 1) ||
    (customerAccess === "restricted" && Object.keys(customer).length !== 1)
  )
    throw new Error("booking_context_invalid");
  let parsedCustomer: BookingContextV1["customer"] = { access: "restricted" };
  if (customerAccess === "allowed") {
    if (!Array.isArray(customer.history) || customer.history.length > 20)
      throw new Error("booking_context_invalid");
    parsedCustomer = {
      access: "allowed",
      customerId: text(customer.customerId),
      state: oneOf(customer.state, ["active", "restricted", "erased"]),
      history: customer.history.map((entry) => {
        const h = record(entry);
        return {
          bookingId: text(h.bookingId),
          publicReference: text(h.publicReference),
          serviceName: text(h.serviceName),
          status: oneOf(h.status, bookingStatusesV1),
          startAt: instant(h.startAt),
          endAt: instant(h.endAt),
        };
      }),
    };
  }
  return {
    contractVersion: 1,
    bookingId: text(row.bookingId),
    contactAccess: oneOf(row.contactAccess, ["allowed", "restricted"]),
    intake:
      intakeAccess === "restricted"
        ? { access: "restricted" }
        : {
            access: "allowed",
            schema: record(intake.schema),
            answers: record(intake.answers),
          },
    request: {
      approvalStatus: oneOf(request.approvalStatus, [
        "not_required",
        "pending",
        "approved",
        "declined",
        "expired",
      ]),
      approvalDeadline:
        request.approvalDeadline === null ? null : instant(request.approvalDeadline),
      publicReason: request.publicReason === null ? null : text(request.publicReason),
      submittedAt: instant(request.submittedAt),
    },
    customer: parsedCustomer,
  };
}
