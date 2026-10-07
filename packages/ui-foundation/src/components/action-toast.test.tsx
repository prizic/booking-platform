import { isValidElement, type ReactElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const sonner = vi.hoisted(() => ({
  loading: vi.fn(() => "toast-1"),
  success: vi.fn(),
  error: vi.fn(),
  dismiss: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: sonner }));

import { actionError, actionOk } from "../forms/action-result.js";
import {
  actionToastCopy,
  isValidationOnlyFailure,
  runActionWithToast,
  type ActionToastCopy,
} from "./action-toast.js";

const copy: ActionToastCopy<{ id: string }> = {
  loading: "Saving…",
  success: (data) => `Saved ${data?.id ?? "-"}`,
  error: ({ code }) => `Could not save: ${code}`,
};

/** The text inside the role="alert" wrapper of an error toast. */
function alertContent(node: ReactNode): ReactNode {
  expect(isValidElement(node)).toBe(true);
  const element = node as ReactElement<{ role?: string; children?: ReactNode }>;
  expect(element.props.role).toBe("alert");
  return element.props.children;
}

function textOf(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join(" ");
  if (isValidElement(node))
    return textOf((node as ReactElement<{ children?: ReactNode }>).props.children);
  return "";
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("runActionWithToast", () => {
  it("shows nothing when toasts are off", async () => {
    const action = vi.fn(async () => actionOk({ id: "a" }));
    await expect(runActionWithToast(action, 1, false)).resolves.toEqual(
      actionOk({ id: "a" }),
    );
    await runActionWithToast(
      async () => actionError("revision_conflict"),
      1,
      undefined,
    );
    await expect(
      runActionWithToast(
        async () => {
          throw new Error("offline");
        },
        1,
        false,
      ),
    ).rejects.toThrow("offline");
    for (const call of Object.values(sonner)) expect(call).not.toHaveBeenCalled();
  });

  it("turns the loading toast into success on a committed result", async () => {
    const result = await runActionWithToast(async () => actionOk({ id: "b" }), 1, copy);
    expect(result).toEqual(actionOk({ id: "b" }));
    expect(sonner.loading).toHaveBeenCalledWith("Saving…");
    expect(sonner.success).toHaveBeenCalledWith("Saved b", { id: "toast-1" });
    expect(sonner.error).not.toHaveBeenCalled();
  });

  it("turns it into an alert with the refusal's message on ok:false", async () => {
    const result = await runActionWithToast(
      async () => actionError("revision_conflict"),
      1,
      copy,
    );
    expect(result.ok).toBe(false);
    expect(sonner.success).not.toHaveBeenCalled();
    const [content, options] = sonner.error.mock.calls[0] as unknown as [
      ReactNode,
      { id: string },
    ];
    expect(alertContent(content)).toBe("Could not save: revision_conflict");
    expect(options).toMatchObject({ id: "toast-1" });
  });

  it("closes the toast silently for a validation-only refusal", async () => {
    await runActionWithToast(
      async () => actionError("invalid", { name: ["required"] }),
      1,
      copy,
    );
    expect(sonner.dismiss).toHaveBeenCalledWith("toast-1");
    expect(sonner.success).not.toHaveBeenCalled();
    expect(sonner.error).not.toHaveBeenCalled();
  });

  it("closes the toast silently when the error copy declines the code", async () => {
    await runActionWithToast(async () => actionError("step_up_required"), 1, {
      ...copy,
      error: ({ code }) => (code === "step_up_required" ? null : code),
    });
    expect(sonner.dismiss).toHaveBeenCalledWith("toast-1");
    expect(sonner.error).not.toHaveBeenCalled();
  });

  it("reports a thrown transport failure as the network code and rethrows", async () => {
    await expect(
      runActionWithToast(
        async () => {
          throw new Error("offline");
        },
        1,
        copy,
      ),
    ).rejects.toThrow("offline");
    const [content] = sonner.error.mock.calls[0] as unknown as [ReactNode];
    expect(alertContent(content)).toBe("Could not save: network");
  });

  it("treats Next's navigation signal as success and rethrows it for the router", async () => {
    const signal = Object.assign(new Error("NEXT_REDIRECT"), {
      digest: "NEXT_REDIRECT;replace;/en/services;307;",
    });
    await expect(
      runActionWithToast(
        async () => {
          throw signal;
        },
        1,
        copy,
      ),
    ).rejects.toBe(signal);
    expect(sonner.success).toHaveBeenCalledWith("Saved -", { id: "toast-1" });
    expect(sonner.error).not.toHaveBeenCalled();
  });
});

describe("isValidationOnlyFailure", () => {
  it("only matches field-error refusals", () => {
    expect(isValidationOnlyFailure(actionError("invalid", { a: ["required"] }))).toBe(
      true,
    );
    expect(isValidationOnlyFailure(actionError(undefined, { a: ["required"] }))).toBe(
      true,
    );
    expect(isValidationOnlyFailure(actionError("invalid"))).toBe(false);
    expect(isValidationOnlyFailure(actionError("slot_taken", { a: ["x"] }))).toBe(
      false,
    );
    expect(isValidationOnlyFailure(actionOk())).toBe(false);
  });
});

describe("actionToastCopy", () => {
  it("speaks Arabic and English", () => {
    expect(actionToastCopy("ar")).toMatchObject({
      loading: "جارٍ الحفظ…",
      success: "تم الحفظ",
    });
    expect(actionToastCopy("en")).toMatchObject({
      loading: "Saving…",
      success: "Saved",
    });
  });

  it("names a known refusal and leaves an unknown code at the title", () => {
    const en = actionToastCopy("en", {
      messages: { slot_taken: "That time was taken." },
    });
    const error = en.error as (failure: { code: string }) => ReactNode;
    expect(textOf(error({ code: "slot_taken" }))).toBe(
      "Could not save That time was taken.",
    );
    expect(error({ code: "something_new" })).toBe("Could not save");
    expect(error({ code: "invalid" })).toBe("Could not save");
    expect(textOf(error({ code: "too_long" }))).toBe(
      "Could not save This is too long.",
    );
    const ar = actionToastCopy("ar").error as (failure: { code: string }) => ReactNode;
    expect(ar({ code: "x" })).toBe("تعذّر الحفظ");
  });
});
