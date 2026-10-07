import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  actionError,
  actionOk,
  parseActionInput,
  zodFieldErrors,
} from "./action-result.js";
import { formErrorMessage } from "./messages.js";

const schema = z.object({
  name: z.string().trim().min(1, { error: "required" }),
  email: z.email({ error: "invalid_email" }),
  items: z.array(z.object({ qty: z.number().int({ error: "invalid_integer" }) })),
});

describe("parseActionInput", () => {
  it("returns typed data for valid input", () => {
    const parsed = parseActionInput(schema, {
      name: " Sara ",
      email: "sara@example.invalid",
      items: [{ qty: 2 }],
    });
    expect(parsed).toEqual({
      ok: true,
      data: { name: "Sara", email: "sara@example.invalid", items: [{ qty: 2 }] },
    });
  });

  it("returns error codes keyed by dotted field path", () => {
    const parsed = parseActionInput(schema, {
      name: "",
      email: "x",
      items: [{ qty: 1.5 }],
    });
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.result).toEqual({
      ok: false,
      formError: "invalid",
      fieldErrors: {
        name: ["required"],
        email: ["invalid_email"],
        "items.0.qty": ["invalid_integer"],
      },
    });
  });

  it("refuses non-object input instead of trusting the browser", () => {
    const parsed = parseActionInput(schema, "name=Sara");
    expect(parsed.ok).toBe(false);
  });
});

describe("action results", () => {
  it("builds success and failure shapes", () => {
    expect(actionOk({ id: "1" }, "saved")).toEqual({
      ok: true,
      data: { id: "1" },
      message: "saved",
    });
    expect(actionError("conflict")).toEqual({ ok: false, formError: "conflict" });
  });

  it("maps a pathless issue to _form", () => {
    const error = z
      .object({ a: z.string(), b: z.string() })
      .refine((value) => value.a === value.b, { error: "mismatch" })
      .safeParse({ a: "x", b: "y" }).error!;
    expect(zodFieldErrors(error)).toEqual({ _form: ["mismatch"] });
  });
});

describe("formErrorMessage", () => {
  it("renders generic codes in both languages", () => {
    expect(formErrorMessage("required", "ar")).toBe("هذا الحقل مطلوب.");
    expect(formErrorMessage("required", "en")).toBe("This field is required.");
  });

  it("prefers the app dictionary and falls back to invalid", () => {
    expect(
      formErrorMessage("slot_taken", "en", {
        slot_taken: "That time was just booked.",
      }),
    ).toBe("That time was just booked.");
    expect(formErrorMessage("unknown_code", "en")).toBe(
      "Check this value and try again.",
    );
    expect(formErrorMessage(undefined, "en")).toBeUndefined();
  });
});
