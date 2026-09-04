# 0002. Region, currency, and money representation

Purpose: lock the first launch region, and lock how money is represented, rounded, taxed, and displayed everywhere in the system.

Authoritative source: [the architecture spec](../../WHITE_LABEL_BOOKING_PLATFORM_PRODUCT_ARCHITECTURE.md) §5.1, §18.2, §18.4, §23.3, §30. This ADR does not depart from it.

- **Owner:** @SEIFSEIF4
- **Status:** Accepted
- **Date:** 2026-09-04
- **Supersedes / Superseded by:** —

## Context

Two separate questions get conflated and must not be: *where do we launch* and *how do we represent money*. The first is a legal, tax, and payment-provider question. The second is a correctness question that outlives any region.

The forces in play:

- §30 requires one primary legal and payment region for the first release, while designing for ISO currency from day one. Building multi-region before selling in one region is speculative cost; hard-coding a single currency into the data model is a migration later.
- Floating-point money is a known defect class. Binary floats cannot represent most decimal amounts exactly, so sums, splits, tax lines, and refund remainders drift. §18.2 already mandates integer minor units plus ISO currency in the canonical commerce tables.
- Currencies do not share an exponent. USD and SAR have two minor digits; JPY has zero; some have three. A "cents" field without its currency code is not a monetary value.
- §18.4 records that as of the spec's research date, Saudi Arabia is not shown as a supported Stripe account country. KSA is a market of interest, not a first-release market, and it carries SAMA licensing, ZATCA e-invoicing, and PDPL obligations (§23.3).
- Arabic is not a KSA-only concern. §3.3 and §31 make English/Arabic functional parity an MVP acceptance criterion regardless of where the first tenant trades.
- The Client must show prices, taxes, deposits, and cancellation terms clearly before confirmation (§5.1), which makes formatting a product requirement, not a cosmetic one.

## Decision

1. **US/USD is the initial production, legal, and currency baseline.** The first release is sold to tenants trading in the United States and pricing in US dollars. Legal terms, tax handling, and the payment provider contract are written for that baseline only.
2. Internally, **every monetary value is a pair: an ISO 4217 alphabetic currency code and a signed integer amount in that currency's minor units.** There is no bare number, no float, no double, no `NUMERIC` price column, and no currency-less amount anywhere in the database, the API, the queue payloads, or the application code.
3. Database columns storing money are integer types (`bigint` for amounts) with an adjacent `char(3)` currency column, or a composite type carrying both. A money column without its currency column is a schema defect and fails review.
4. The minor-unit exponent is derived from the ISO 4217 currency code, never assumed to be 2. Code that multiplies or divides by 100 to convert to or from a display value is a defect.
5. Amounts are never converted between currencies inside the product. A booking, its payment, its refunds, and its ledger entries all carry one currency, and it is the currency snapshotted onto the booking (see the policy-snapshot ADR).
6. **Rounding:** all arithmetic is integer arithmetic in minor units. Where a calculation is inherently fractional — percentage tax, percentage deposit, percentage cancellation refund — the result is rounded half-up to the nearest minor unit, and the rounding remainder is recorded on the line it belongs to so component lines always sum exactly to the recorded total. No total is ever recomputed at display time from rounded components.
7. **Tax representation:** tax is stored as its own line, with a tax rate as an integer in basis points, a computed tax amount in minor units, a tax-inclusive-or-exclusive flag, and the tax label the tenant configured. Tax is never folded into the unit price and never re-derived after the booking is created. The system performs no tax determination, nexus analysis, or filing; it records what the tenant configured. Whether the tenant's configured tax is correct requires independent legal and tax review.
8. **Display and formatting are the presentation layer's job only.** Formatting uses the platform's standard locale-aware number formatting with the value's ISO currency code and the user's locale. The server never sends a pre-formatted money string as data, and the client never parses a formatted string back into an amount.
9. Arabic formatting is a first-class case: currency position, digit shaping, and separators follow the locale, and the amount itself is unchanged by locale. RTL layout must not reorder a currency symbol into an incorrect position — this is covered by acceptance tests, not by hand-built strings.
10. Money crossing a system boundary — API responses, webhook payloads, exports, emails — carries both the integer minor units and the currency code. CSV exports additionally carry a formatted column for humans, clearly named as derived.
11. **Saudi Arabia / KSA is a future region and is explicitly out of first-release scope.** No KSA-specific tax, invoicing, residency, or provider behavior is built in v1.
12. Before any KSA launch, a SAMA payment-licensing review, a ZATCA e-invoicing review, and a PDPL/SDAIA data-protection review must each be completed with qualified Saudi counsel and recorded as a superseding ADR. The platform makes no compliance claim for any region; all of this requires independent legal review.
13. **English/Arabic bilingual parity remains an MVP requirement independent of the launch region.** Shipping US-only does not defer Arabic, RTL, or the accessibility parity criteria in §31.
14. **Data residency: the shared Supabase project is hosted in a US region.** In v1 all tenant data — Postgres, storage objects, and backups — lives in that one US region, and no residency choice is offered to tenants. Residency in a second region is not a configuration change: it requires a **superseding ADR** and an **independent legal review of the destination jurisdiction**, both completed *before* any production data exists there. No second-region project, read replica, or bucket may be created ahead of that ADR. This resolves the residency half of §30's "Data residency/retention" row; retention periods are decided separately and are not settled here.

Alternatives considered:

- **Decimal/`NUMERIC` money columns.** Rejected: they still need a currency code to be meaningful, they invite implicit float conversion at the driver and JSON boundary, and they permit sub-minor-unit amounts that no payment provider can settle.
- **Store money as a formatted string.** Rejected: unsummable, unsortable, locale-contaminated data.
- **Launch US and KSA together.** Rejected: §18.4 and §23.3 make KSA a separate provider and legal workstream; coupling it to v1 makes the launch date depend on a foreign regulatory review.
- **Defer Arabic until a KSA launch.** Rejected: §31 makes bilingual parity a production acceptance criterion, and retrofitting RTL after the fact is the failure mode §29 explicitly warns about.

## Consequences

### Positive

- Money arithmetic is exact and reproducible; totals reconcile with provider amounts, which are themselves integer minor units.
- Adding a second currency is a data and pricing exercise, not a schema migration, because the currency code is already carried everywhere.
- Legal, tax, and provider work in v1 is scoped to one jurisdiction, which is what makes the phase estimate in §28.2 credible.
- Formatting bugs are confined to the presentation layer and are testable per locale.

### Negative / cost

- Every money value costs two fields and a small amount of ceremony, including in test fixtures and seed data.
- Developers must consciously avoid the familiar `price * 1.08` shape; this needs a lint rule or review checklist to hold over time.
- US-only launch means non-US prospects cannot be onboarded even where the product would technically work, which constrains the pilot pipeline.
- Single-region residency disqualifies any prospect with a contractual or statutory in-region storage requirement, and there is no shortcut: the answer is a superseding ADR and legal review, not a setting.
- Arabic parity without an Arabic-trading launch region means building and testing a locale that no v1 tenant may commercially need yet.
- Tax handling is deliberately dumb: the tenant carries the burden of configuring correct rates, and the platform must say so in tenant terms. This requires independent legal review.

## Revisit triggers

- A tenant is signed who prices in any currency other than USD.
- A currency with a minor-unit exponent other than 2 enters the system.
- A KSA launch is proposed, or SAMA, ZATCA, or PDPL review is commissioned.
- A tenant, prospect, or counsel requires tenant data to be stored outside the US region, or any second region is proposed for latency, redundancy, or residency reasons (invalidates decision 14).
- Stripe's published global availability changes for any region we intend to sell in (point-in-time; revalidate before relying on it).
- Any requirement appears for currency conversion, multi-currency pricing on one tenant, or settlement in a currency other than the booking currency.
- A tax authority interaction, e-invoicing mandate, or marketplace facilitator rule applies to the platform rather than the tenant.
- Reported revenue stops reconciling exactly with the payment provider's settled amounts.

## References

- [Architecture spec](../../WHITE_LABEL_BOOKING_PLATFORM_PRODUCT_ARCHITECTURE.md) §3.3, §5.1, §18.2, §18.4, §23.3, §28.2, §29, §30, §31
- [Architecture overview](../architecture.md)
- [Glossary](../glossary.md) — minor units, currency, tax line
- [Release scope](../release-scope.md)
- [Security and privacy](../security-and-privacy.md)
- [References](../references.md) — SAMA, ZATCA, SDAIA/PDPL, and Stripe availability sources, all point-in-time
- [ADR index](./README.md)
- ADR [0003](./0003-merchant-of-record-and-payments.md) — merchant of record and payments
- GitHub issue #2
