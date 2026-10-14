import { renderToStaticMarkup } from "react-dom/server";
import { QueryProvider } from "@wlbp/ui-foundation";
import { describe, expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
import { RecoveryForm } from "./recovery-form";

describe("R5 email-only recovery presentation", () => {
  it.each(["en", "ar"] as const)(
    "has one labelled email control, submission and privacy-safe guidance (%s)",
    (locale) => {
      const html = renderToStaticMarkup(
        <QueryProvider>
          <RecoveryForm locale={locale} />
        </QueryProvider>,
      );
      expect(html.match(/type="email"/gu)).toHaveLength(1);
      expect(html).toContain(locale === "en" ? "Email address" : "البريد الإلكتروني");
      expect(html).toContain('type="submit"');
      expect(html).toContain(`href="/${locale}/contact"`);
      expect(html).not.toMatch(/type="password"|name="reference"|localStorage|email=/u);
      expect(html).toContain(
        locale === "en"
          ? "Each email link opens only its booking"
          : "يفتح كل رابط بريد حجزه فقط",
      );
    },
  );
});
