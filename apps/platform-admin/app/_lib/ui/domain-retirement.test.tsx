import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DomainReplacement, DomainRetiredAt } from "./domain-retirement";

const replacementId = "d4000000-0000-4000-8000-000000000137";
const tenantId = "d1000000-0000-4000-8000-000000000136";

describe("retained domain history presentation", () => {
  it.each(["en", "ar"] as const)(
    "renders the recorded instant and linked replacement in %s",
    (locale) => {
      const domain = {
        retired_at: "2026-10-13T08:00:00+00:00",
        replacement_domain_id: replacementId,
      };
      const html = renderToStaticMarkup(
        <>
          <DomainRetiredAt locale={locale} domain={domain} />
          <DomainReplacement
            locale={locale}
            domain={domain}
            tenantId={tenantId}
            domains={[{ id: replacementId, hostname: "replacement.example.invalid" }]}
          />
        </>,
      );
      expect(html).toMatch(/datetime="2026-10-13T08:00:00\+00:00"/iu);
      expect(html).toContain(
        `href="/${locale}/domains/${replacementId}?tenant=${tenantId}"`,
      );
      expect(html).toContain("replacement.example.invalid");
    },
  );

  it.each(["en", "ar"] as const)(
    "keeps absent legacy fields explicitly unreported in %s",
    (locale) => {
      const html = renderToStaticMarkup(
        <>
          <DomainRetiredAt locale={locale} domain={{}} />
          <DomainReplacement locale={locale} domain={{}} tenantId={tenantId} />
        </>,
      );
      expect(html).toContain(locale === "en" ? "Not reported" : "لم يُبلّغ");
      expect(html).not.toContain("<time");
      expect(html).not.toContain("href=");
    },
  );

  it("keeps the replacement UUID inspectable when its hostname is not in the current page", () => {
    const html = renderToStaticMarkup(
      <DomainReplacement
        locale="en"
        domain={{ replacement_domain_id: replacementId }}
        tenantId={tenantId}
      />,
    );
    expect(html).toContain(replacementId);
    expect(html).toContain("href=");
  });
});
