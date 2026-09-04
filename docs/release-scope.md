# Release Scope

What ships in the first release, what waits, what is excluded outright, and which GitHub milestone owns each bucket.

Authoritative source: §8 (8.1, 8.2, 8.3), §3.4 and §28 of [the architecture spec](../WHITE_LABEL_BOOKING_PLATFORM_PRODUCT_ARCHITECTURE.md).

Related: [docs/README.md](./README.md) · [product-vision](./product-vision.md) · [glossary](./glossary.md) · [architecture](./architecture.md) · [engineering-rules](./engineering-rules.md) · [runbooks](./runbooks.md) · [upstream-updates](./upstream-updates.md) · [adr/README.md](./adr/README.md)

Scope changes are ADR-worthy. Moving an item from "later" into MVP is a decision with a test-surface cost, not a backlog reshuffle.

---

## 1. Not first-release capabilities

Stated explicitly so nothing here is implied, quoted, or sold before it exists:

- **Hotel / nightly inventory** — property-management inventory with nightly rates and room-type yield rules is NOT a first-release capability. It needs a date-bucket inventory and pricing model and is a separate product module.
- **Airline / seat maps** — transport seat maps are NOT a first-release capability.
- **Marketplace ticketing** — general event-ticket marketplace discovery, provider routing, and ticket scanning are NOT first-release capabilities.
- **Native mobile** — native iOS and Android applications are NOT a first-release capability.
- **Arbitrary plugins** — a no-code page builder with arbitrary executable plugins, and arbitrary third-party plugin execution generally, are NOT first-release capabilities.
- **Customer attachments** — customer-uploaded files are NOT a first-release capability. This is a recoverability gate, not an effort estimate: Postgres PITR does not restore deleted Storage objects (only their metadata), so uploads would be a data class with a deletion story and no restore story. Attachments become in scope only once an independent object backup and a byte-level restore drill are in place (issue #39). See [ADR-0008](./adr/0008-privacy-retention-and-support-access.md).
- **Regulated clinical records** — storage of clinical records or other specially regulated records is NOT a first-release capability; any such workflow requires a separate compliance design and legal review before it is offered.

Also excluded from the first release: full CRM, accounting, payroll, or workforce management; and customer-defined database migrations (only the private platform release pipeline runs migrations).

## 2. MVP — the sellable first release

| Area | In scope |
| --- | --- |
| Applications | Client and Dashboard white-label apps |
| Control plane | Platform Admin tenant/instance registry and resumable provisioning |
| Catalog | Services, categories, locations, staff, exclusive resources |
| Scheduling | Weekly availability, breaks, buffers, date overrides, time off, blackout periods |
| Booking modes | One-to-one, exclusive-resource, request-to-book |
| Customer access | Guest booking and secure manage-booking links |
| Booking lifecycle | Create, reschedule, cancel, check-in, complete, no-show |
| Payments | Optional deposits or full payment through one provider adapter |
| Email | Confirmation, reminder, change, cancellation, and staff-alert mail via Resend |
| Calendar | One-way add-to-calendar only: a generated `.ics` attachment/link on confirmation and change mail. Two-way provider sync is Phase 2 |
| i18n | English and Arabic with full RTL behavior |
| Roles | Tenant owner/admin, scheduler, staff, location manager |
| Operations | Calendar/list dashboard, customer directory, basic reports, CSV export |
| Domains | Central default domains plus custom domain connection |
| White-label factory | Config-first instance repository generation, versioned update PRs, generated AI instruction pack |
| Quality | Audit events, RLS tests, booking concurrency tests, backups, operational alerts |

## 3. Phase 2

- Google and Microsoft two-way calendar connections
- Waitlist with automatic promotion
- Group occurrences and attendee-level capacity
- Recurring bookings
- Packages, memberships, coupons, gift cards, credits
- Multi-resource services
- Custom roles and approval workflows
- SMS/WhatsApp provider adapters where legally and commercially appropriate (requires legal review per market)
- Tenant webhooks and API keys with scopes and quotas
- Advanced reports, scheduled exports, data warehouse pipeline
- Premium tenant sending domains
- Multiple brands/instances per tenant
- Dedicated database/project option for enterprise tenants

Note: the group-capacity primitive is built correctly in the data model during MVP and exercised only at `capacity = 1`; its UI and operations wait unconditionally for Phase 2 issue #42.

## 4. Later or separate modules

- Marketplace discovery and provider routing
- Native mobile applications
- Hotel/nightly inventory and dynamic rate plans
- Seat maps and high-volume ticketing
- Regulated health-record workflows (separate compliance design, requires legal review)
- Arbitrary third-party plugin execution

## 5. Milestone map

Every scope bucket maps to exactly one milestone. Issue numbers are the authoritative work breakdown.

| Milestone | Issues | Scope bucket | Main output | Exit gate |
| --- | --- | --- | --- | --- |
| **M0 Product & policy lock** | #1, #2 | Roadmap phase 0 — product/vertical definition | Knowledge pack, lighthouse vertical, exact policies, journeys, merchant and compliance decisions | Signed domain glossary and MVP acceptance criteria |
| **M1 Platform foundation** | #3–#6 | MVP foundation | Monorepo, environments, Auth, tenancy, RLS, CI, design and i18n foundation | Cross-tenant test suite green and all apps deploying |
| **M2 Booking kernel** | #7–#11 | MVP scheduling and booking lifecycle | Schedules, availability, holds, atomic booking/reschedule/cancel, audit | Concurrency, DST, and state-machine gates |
| **M3 Client & Dashboard** | #12–#18, #24 | MVP applications, roles, operations | Customer booking flow and daily tenant operations | End-to-end pilot workflow in English and Arabic |
| **M4 Comms & commerce** | #19–#23 | MVP email and payments | Resend templates and worker, reminders, payment adapter, webhooks, reconciliation | Provider-failure and duplicate-event tests |
| **M5 White-label factory** | #25–#36 | MVP distribution and control plane | Distribution repo, config schema, Platform Admin provisioning, GitHub/Vercel automation, AI pack, upgrade bot | Two full provision → upgrade → rollback pilots |
| **M6 Hardening & launch** | #37–#41 | MVP release readiness | Load, security, accessibility, observability, DR drills, support runbooks | Production-readiness review and pilot sign-off |
| **M7 Phase 2** | #42–#57 | Phase 2 scope (§3 above) | Calendars, waitlist, group occurrences, recurrence, commerce extras, custom roles, tenant API | Per-feature acceptance; no MVP regression |
| **M8 Later modules** | #58–#63 | Later or separate modules (§4 above) | Marketplace, native mobile, nightly inventory, seat maps, regulated workflows, plugin execution | Not scheduled; each requires its own product and compliance design |

## 6. Delivery timeline

Planning ranges from §28, assuming roughly one product lead, one designer, one technical lead, three to five engineers across Next.js/Postgres/platform, and dedicated or embedded QA, with security, legal, and finance specialists available at gates. A range, not a quote.

| Phase | Milestone | Typical duration |
| --- | --- | --- |
| 0. Product/vertical definition | M0 | 2–3 weeks |
| 1. Platform foundation | M1 | 4–6 weeks |
| 2. Booking kernel | M2 | 6–8 weeks |
| 3. Client and Dashboard | M3 | 7–10 weeks, parallel |
| 4. Communications/commerce | M4 | 4–6 weeks |
| 5. White-label factory | M5 | 6–8 weeks |
| 6. Hardening and pilot | M6 | 4–6 weeks |

Several phases run in parallel once tenancy and contracts stabilize. A credible production v1 lands at roughly **24–34 calendar weeks**. Adding group classes, two-way calendars, marketplace payment liability, custom roles, or a no-code builder to the first release increases implementation and test surface substantially — which is why each sits in M7 or M8.

## 7. First vertical

Launch with one lighthouse segment whose rules fit one-to-one and exclusive-resource appointments. Duration, buffers, approval, deposits, locations, and staff/resource assignment are configurable. "Works for every booking business" is a roadmap statement, not an MVP acceptance criterion.

## 8. Workstream ownership

| Workstream | Owns |
| --- | --- |
| Product/domain | Glossary, policies, workflows, exception handling, analytics definitions |
| Design | White-label token contract, Client/Dashboard systems, Arabic/RTL, accessibility |
| Backend | Schemas, RLS, RPCs, queues, provider inbox/outbox, migrations, recovery |
| Applications | Client, Dashboard, Platform Admin, SSR/data access, tests |
| Platform | GitHub App, distribution, upgrade bot, Vercel, domains, observability |
| Integrations | Resend, payments, calendars, reconciliation and provider-health UX |
| QA/security | Threat model, RLS/concurrency/provider-failure tests, release gates |
| Operations/compliance | Support access, incidents, retention, merchant-of-record decision, privacy, contractual SLOs |

Design details live in [design-system](./design-system.md); operational procedures in [runbooks](./runbooks.md) and [local-setup](./local-setup.md); privacy and security posture in [security-and-privacy](./security-and-privacy.md).
