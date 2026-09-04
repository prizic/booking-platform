# Glossary

The single naming authority for this repository: every term below means exactly one thing in code, schema, UI copy, and tickets.

Authoritative source: §3.2 of [the architecture spec](../WHITE_LABEL_BOOKING_PLATFORM_PRODUCT_ARCHITECTURE.md), with terms drawn from §1, §4, §7, §10 and §11.

Related: [docs/README.md](./README.md) · [product-vision](./product-vision.md) · [architecture](./architecture.md) · [customization-boundaries](./customization-boundaries.md) · [engineering-rules](./engineering-rules.md) · [release-scope](./release-scope.md) · [upstream-updates](./upstream-updates.md) · [references](./references.md)

Rule: if a term here appears in a PR with a different meaning, the PR is wrong, not the glossary. Add or change terms by ADR ([adr/README.md](./adr/README.md)).

---

## 1. Tenant, Brand, and Instance are NOT synonyms

This is the most expensive naming mistake available to us, so it is stated first. Three separate identifiers, three separate lifecycles, three separate tables.

| Term | Definition | One-line example of it being distinct |
| --- | --- | --- |
| **Tenant** | A business or organization whose data is isolated from every other tenant. The unit of data ownership and the value in `tenant_id`. | "Nadia Group" is one tenant with one customer list and one set of bookings, even though it trades under two different names. |
| **Brand** | Visual, content, locale, domain, and communication settings. The unit of appearance and voice. | Nadia Group owns two brands, "Nadia Clinics" and "Nadia Spa", with different logos, palettes, domains, and confirmation-email wording. |
| **Instance** | A deployed Client + Dashboard application pair associated with one tenant and one brand. The unit of deployment. | "Nadia Spa" is served by two instances, one for the UAE domain and one for the KSA domain, each with its own repository, Vercel projects, and upstream version. |

Note on the Instance example: multi-instance is the **data model**, not a v1 capability. v1 is locked to one tenant, one brand, one instance; multiple brands or instances per tenant are Phase 2 (issue #55, [ADR-0010](./adr/0010-deferred-scope.md)). The identifiers stay separate from day one; the interface does not appear.

Consequences to respect in code:

- One tenant can eventually own multiple brands and multiple instances while retaining one operational data set.
- Never derive a tenant from a brand name, and never key data on an instance identifier.
- `tenant_id` is the RLS boundary. Brand and instance identifiers are not security boundaries and must never be used as one.
- Keeping these separate from day one avoids a migration that is painful once tenant data exists.

## 2. Structural terms

| Term | Definition | Not to be confused with |
| --- | --- | --- |
| **Platform** | The SaaS product operated by the platform company, including the private control plane and the shared backend. | A tenant. The platform is the operator; a tenant is a customer of it. |
| **Location** | A branch, venue, or service area within a tenant. Carries its own timezone, schedule, and scope for location-manager permissions. | Tenant. A tenant with one location is still a tenant with a location, not a location. |

## 3. Catalog and capacity terms

| Term | Definition | Not to be confused with |
| --- | --- | --- |
| **Service** | Something customers can book, carrying duration, buffers, pricing, capacity, eligible locations, eligible staff/resources, and an intake schema. | Booking. A service is the offer; a booking is one purchase of it. |
| **Resource** | A capacity constraint that can be exclusively occupied: a staff member, room, vehicle, chair, or device. The scheduling primitive. | Staff. Every staff member is modelled as a resource; not every resource is a person. |
| **Staff** | A human with a membership in the tenant, a role, capabilities, working hours, skills, and time off. Both an authorization subject and (usually) a bookable resource. | Resource. A room has availability but no login, no role, and no capabilities. |
| **Occurrence** | A specific class or event session with a fixed start, end, and capacity, against which multiple attendees are booked. | Booking. One occurrence holds many bookings; a one-to-one appointment has no occurrence. |

## 4. Time and reservation terms

| Term | Definition | Not to be confused with |
| --- | --- | --- |
| **Allocation** | The protected reservation of a resource or of capacity for a time range. The row that makes a slot unavailable to anyone else. | Booking. The allocation protects the time; the booking is the customer-facing agreement referencing it. |
| **Hold** | A short-lived allocation created while checkout is in progress, carrying an expiry and an idempotency key. Expires automatically if checkout does not complete. | Allocation. Every hold is an allocation; a confirmed allocation is not a hold. |
| **Booking** | The customer-facing record of a proposed or reserved service. Instant checkout uses `held → pending_payment / confirmed`; request-to-book uses `requested → pending_payment / confirmed / rejected`; confirmed bookings may become `checked_in`, `completed`, `cancelled`, or `no_show`. `expired` closes an unfinished attempt. The governing snapshot is taken at the first durable booking state. | Payment, refund, notification, provider-exception, and calendar-export state, which are tracked separately. A booking can be `confirmed` while its email is `failed`. |

## 5. Architectural layer terms

| Term | Definition | Not to be confused with |
| --- | --- | --- |
| **Product kernel** | Booking rules, availability computation, permissions, API contracts, data access, and shared UI primitives. Distributed surfaces consume payment and notification outcomes through contracts; provider adapters and privileged workers stay platform-only. | Instance layer. Kernel edits inside an instance repository are the exceptional case and forfeit automated upgrades. |
| **Instance layer** | Everything an instance may legitimately own: brand tokens, content, navigation, feature flags, assets, and approved typed extension slots — in practice, the `instance/` directory. | Product kernel. The instance layer configures behavior; it never redefines auth, tenant resolution, booking transactions, or payment verification. |
| **Control plane** | Provisioning, repositories, deployments, domains, email-domain verification, plans, versions, health, support access, and global audit. Lives in Platform Admin and the private monorepo. | Dashboard. The Dashboard operates one tenant's business; the control plane operates the fleet. |

## 6. Distribution and versioning terms

| Term | Definition | Not to be confused with |
| --- | --- | --- |
| **Distribution repository** | The sanitized Client + Dashboard source from which every instance repository is seeded. Contains no Platform Admin code, no privileged workers, no migrations, and no platform secrets. | The private monorepo, which is the source of truth and holds everything the distribution repository deliberately excludes. |
| **Logical fork** | An independently private instance repository seeded from a controlled upstream, sharing a common ancestor with the distribution repository and recording an `upstream_release`. Not a GitHub-native fork, which would inherit visibility, permission, and deletion coupling. | A GitHub fork. Product language may say "instance fork"; the technical artifact is an independent private repository. |
| **Upstream version** | The white-label release an instance is based on, recorded in `manifest.json` / `.platform/base.json`. Paired with a backend contract range: an instance may deploy only when its supported range includes the current backend contract version. | Application version or deployment ID. Platform Admin displays code version and backend contract version separately. |

## 7. Customization tiers

| Term | Definition | Upgrade consequence |
| --- | --- | --- |
| **Config-only instance** | Customization limited to brand tokens, assets, copy, feature flags, provider settings, and approved extension slots. No edits outside `instance/`. | Eligible for automated upgrade pull requests. |
| **Extended instance** | Contains allowed application code edits beyond `instance/`. | Requires manual review, a conflict budget, and a different update and support SLA. |

CI computes the delta against `.platform/base.json` and enforces `.platform/customization-policy.json`, CODEOWNERS, and repository rulesets. Agent instructions guide behavior but are **not** a security control. See [customization-boundaries](./customization-boundaries.md).

## 8. Related terms used throughout

| Term | Definition |
| --- | --- |
| Membership | The row linking an `auth.users` identity to a tenant and a role; the live source of authorization, resolved from current database state rather than from long-lived JWT claims. |
| Capability | A named permission such as `booking.cancel`, `refund.issue`, or `brand.publish`. Roles are bundles of capabilities. |
| Entitlement | A plan-granted capability resolved by the backend. Editing `features.json` can disable or configure an entitled capability, never unlock one. |
| Idempotency key | The client-supplied key that makes a repeated booking mutation safe to retry without creating a duplicate allocation. |
| Support session | A time-limited, scoped, audited grant allowing a platform support operator to act inside one tenant, with a visible banner and no silent impersonation. |
| Fully white-label | A deployment with a tenant-controlled domain, no platform branding, tenant assets/content/legal links, branded mail, and no cross-tenant leakage. Without a custom domain and branded mail it is **branded**, not white-label. |

## 9. Identifier conventions

One term, one identifier spelling, everywhere: schema columns, TypeScript types, API fields, analytics events, and UI copy.

| Term | Identifier | Notes |
| --- | --- | --- |
| Tenant | `tenant_id` | On every tenant-owned row; the RLS boundary. Never optional, never nullable. |
| Brand | `brand_id` | Presentation scope only. Never used for authorization. |
| Instance | `instance_id` | Deployment scope only. Never stored on booking or customer data. |
| Location | `location_id` | Carries its own timezone; scopes the location-manager role. |
| Service | `service_id` | |
| Resource | `resource_id` | Covers staff-backed and non-human resources alike. |
| Staff | `membership_id` for authorization, `resource_id` when scheduled | A staff member is one person appearing in two roles; do not collapse the two identifiers. |
| Occurrence | `occurrence_id` | Null for one-to-one appointments. |
| Allocation | `allocation_id` | The row that makes time unavailable. |
| Hold | An allocation row with an expiry; not a separate identifier namespace | Carries `idempotency_key`. |
| Booking | `booking_id` | Customer-facing reference is a separate, non-sequential public code. |
| Upstream version | `upstream_release` plus a backend contract range | Recorded in `manifest.json` and `.platform/base.json`. |

## 10. Banned synonyms

These words invite exactly the collapse this glossary exists to prevent. Use the right-hand column.

| Do not write | Write instead |
| --- | --- |
| "client" meaning a customer of a tenant | **Customer** ("Client" is the name of the public application) |
| "site", "deployment", or "app" meaning a tenant | **Instance**, or **Tenant** if data ownership is meant |
| "account" meaning a tenant | **Tenant** (an account is one authenticated user) |
| "provider" meaning a staff member | **Staff** ("provider" is reserved for payment, calendar, and email providers) |
| "slot" meaning a reservation | **Allocation** (a slot is an offered time, an allocation is a claimed one) |
| "reservation" meaning a booking | **Booking**, or **Hold** if it is short-lived and expiring |
| "class" meaning a bookable session | **Occurrence** |
| "fork" meaning an instance repository | **Logical fork**, or the repository itself |
| "compliant" describing this product | Describe the control, and note that the claim **requires legal review** |

## 11. Money and commerce terms

Locked by [ADR-0002](./adr/0002-region-currency-and-money-representation.md) (region, currency, money representation) and [ADR-0003](./adr/0003-merchant-of-record-and-payments.md) (merchant of record and payments).

| Term | Definition | Not to be confused with |
| --- | --- | --- |
| **Minor units** | The smallest indivisible unit of a currency. Every monetary value in the system is a signed integer count of minor units carried together with its currency code — in the database, the API, queue payloads, exports, and application code. | "Cents". The minor-unit exponent is derived from the currency code and is not always 2; code that multiplies or divides by 100 is a defect. |
| **Currency** | The ISO 4217 alphabetic code that gives a minor-unit amount its meaning. Snapshotted onto the booking at creation; the booking, its payments, refunds, and ledger entries all carry that one currency, and the product never converts between currencies. | Locale. Locale decides how an amount is formatted; currency decides what the amount *is*. An amount without a currency code is not a monetary value. |
| **Tax line** | A stored line carrying a rate in basis points, a computed amount in minor units, an inclusive-or-exclusive flag, and the tenant-configured label. Never folded into the unit price, never re-derived after the booking is created. | Tax determination. The platform performs no nexus analysis, rate lookup, or filing; it records what the tenant configured, and whether that configuration is correct **requires independent legal review**. |
| **Merchant of record** | The party that legally sells to the customer and contracts with the payment provider. In v1 this is always the tenant, on the tenant's own connected account. | The platform. The platform does not hold tenant customer funds by default; tax, reporting, settlement liability, and consumer-protection duties follow the merchant of record. |
| **Deposit** | A partial payment taken at booking time, stored as its own amount in minor units with its currency alongside the total, so the balance due is always derivable. Snapshotted with the booking. | A hold, which reserves *time* and not money. Also not a percentage recomputed at read time — later tenant price edits never change an existing booking's deposit. |
| **Payment status** | The state of money on a booking, on its own column with its own state machine. | Booking status. They are separate columns and separate machines: a booking can be confirmed and unpaid, or paid and cancelled. Neither may be derived from the other, and a browser redirect never sets it. |
| **Dispute** | A chargeback the customer raises with their card issuer against the merchant of record — the tenant. The platform surfaces state, deadlines, and the booking evidence it holds. | A refund, which the tenant initiates from cancellation terms snapshotted on the booking. The platform never submits dispute evidence or accepts liability on a tenant's behalf. |

## 12. Customer-access terms

Locked by [ADR-0004](./adr/0004-guest-first-booking-and-management-links.md) (guest-first booking and management links).

| Term | Definition | Not to be confused with |
| --- | --- | --- |
| **Guest booking** | The default booking path: a customer books with an email address and the fields the tenant marked required, with no password, no account, and no verification step before the booking exists. Account creation is offered only after confirmation, never as a gate. | An anonymous booking. A guest booking has an identified, contactable customer — it simply has no account. |
| **Manage-booking link** | A URL carrying an opaque, expiring, single-use-for-actions, revocable token scoped to exactly one booking and one intent: view, booking action, request-alternative response, or one privacy-right request. Only a hash of the token is stored. | A login or magic link. A magic link creates a general-purpose session; a manage-booking link authorizes one intent on one booking and nothing else. |
| **Step-up authentication** | The email OTP sent to the booking's verified address for an action intent, bound to that token and intent and required *in addition* to a valid link. Privacy intents create a workflow; they do not directly edit snapshots. | The manage-booking token itself. The token establishes *which booking*; step-up authorizes *the action*. An OTP issued for one action cannot authorize another. |
