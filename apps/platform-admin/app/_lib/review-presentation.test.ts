import { describe, expect, it } from "vitest";
import { say } from "./copy";
import { reviewApprovalCopy } from "./review-presentation";

describe("Review approval outcomes", () => {
  it.each(["en", "ar"] as const)(
    "support approval reports a scoped read grant in %s",
    (locale) => {
      const message = say(
        locale,
        reviewApprovalCopy({ kind: "support", action: "support_access" }),
      );
      expect(message).toContain(
        locale === "en" ? "Read-only support access" : "الدعم للقراءة فقط",
      );
      expect(message).not.toContain(locale === "en" ? "job" : "مهمته");
    },
  );

  it.each(["en", "ar"] as const)(
    "route retirement separates SQL cutover from provider removal in %s",
    (locale) => {
      const message = say(
        locale,
        reviewApprovalCopy({ kind: "job", action: "retire_domain" }),
      );
      expect(message).toContain(
        locale === "en"
          ? "Provider resources have not been removed"
          : "لم يزل هذا القرار موارد المزوّد",
      );
    },
  );

  it("closure approval remains pending verified execution", () => {
    const message = say(
      "en",
      reviewApprovalCopy({ kind: "job", action: "close_instance" }),
    );
    expect(message).toContain("closure is not immediate");
  });
});
