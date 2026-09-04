# Product Vision

What this product is, who it serves, and how it is split into three applications and three architectural layers.

Authoritative source: §1, §3.1, §3.3, §3.4, §3.5, §4, §5 of [the architecture spec](../WHITE_LABEL_BOOKING_PLATFORM_PRODUCT_ARCHITECTURE.md).

Related: [docs/README.md](./README.md) · [architecture](./architecture.md) · [release-scope](./release-scope.md) · [glossary](./glossary.md) · [customization-boundaries](./customization-boundaries.md) · [security-and-privacy](./security-and-privacy.md) · [adr/README.md](./adr/README.md)

---

## 1. Product statement

A business launches a branded booking website and an operational dashboard without building scheduling infrastructure.

- **Customers** discover a service, see valid availability, reserve or request a time, pay when required, and manage their booking.
- **Staff** configure services, people, resources, schedules, policies, communications, and reporting.
- **The platform team** provisions and maintains every instance from one private control plane.

## 2. The three layers

Layer boundaries are the primary design constraint; everything else follows from them.

| Layer | Owns | Distributed to tenants? |
| --- | --- | --- |
| Product kernel | Booking rules, availability, permissions, API contracts, data access, and shared UI primitives. Distributed apps consume payment and notification outcomes through versioned contracts; provider adapters and privileged workers stay platform-only | Only the approved dependency closure in ADR-0011 |
| Instance layer | Brand, content, navigation, feature flags, assets, approved extension slots | Yes, this is the editable surface |
| Control plane | Provisioning, repositories, deployments, domains, email-domain verification, plans, versions, health, support access, global audit | No, never |

See [customization-boundaries](./customization-boundaries.md) for what an instance may edit, and [upstream-updates](./upstream-updates.md) for how kernel changes reach instances.

## 3. Standing decisions

| Decision | Position |
| --- | --- |
| Tenancy | Shared schema, mandatory `tenant_id` on every tenant-owned row, RLS as the non-optional isolation boundary |
| Booking correctness | Atomic PostgreSQL functions/transactions. The browser never implements booking correctness |
| Backend projects | One central Supabase production project initially; dedicated projects are an enterprise path, not the default |
| Instance repositories | Managed **logical forks** seeded from a sanitized distribution repository, each carrying an explicit upstream version. Native GitHub forks only inside one trusted org and only when that coupling is intentional |
| Migrations | Central platform pipeline only. An instance repository can never run a shared production migration |
| Upgrades | Versioned releases delivered as bot-created pull requests |
| Languages | English and Arabic, including correct RTL, from semantic components rather than duplicated pages |
| Accessibility | WCAG 2.2 AA target |

Rationale and alternatives belong in [adr/README.md](./adr/README.md); implementation detail in [architecture](./architecture.md) and [engineering-rules](./engineering-rules.md).

## 4. Goals

- Launch branded booking experiences quickly.
- Reliable availability across staff, locations, services, and resources.
- An efficient daily operating dashboard, not merely a configuration screen.
- Every booking mutation race-safe, auditable, and idempotent.
- Significant visual and content customization without permanent code divergence.
- One control plane for provisioning and updates across the fleet.
- Correct English and Arabic, including right-to-left layouts.
- A clean path from shared infrastructure to dedicated enterprise isolation.

## 5. Non-goals for the first release

These are excluded by decision, not by omission. Full list and milestone mapping in [release-scope](./release-scope.md).

- Hotel/property-management inventory with nightly rates and room-type yield rules.
- Airline/transport seat maps.
- General event-ticket marketplace discovery and ticket scanning.
- Native iOS/Android applications.
- Full CRM, accounting, payroll, or workforce management.
- A no-code page builder with arbitrary executable plugins.
- Customer-defined database migrations.
- Storage of clinical records or other specially regulated records without a separate compliance design (any such design requires legal review before it is offered).

## 6. Supported booking modes

| Mode | Release | Allocation rule |
| --- | --- | --- |
| One-to-one appointment | MVP | One staff member or resource cannot overlap |
| Exclusive resource booking | MVP | One resource is exclusively occupied |
| Request to book | MVP | Tentative request; staff accepts or rejects |
| Group occurrence | Phase 2 (issue #42) | Atomic capacity decrement up to `capacity`; v1 exercises the dormant primitive only at `capacity = 1` |
| Multi-resource service | Phase 2 | All required resources allocated atomically |
| Recurring series | Phase 2 | Each occurrence validated; explicit partial-failure policy |
| Waitlist | Phase 2 | Ordered promotion with an expiry window |
| Multi-day/nightly inventory | Separate product module | Date-bucket inventory and pricing |

Decision: build the group-capacity primitive correctly in the data model, but ship its UI and operations only in Phase 2 under issue #42. A prospective tenant does not pull it into v1. MVP acceptance testing covers only the modes actually sold.

## 7. Personas

| Persona | Scope |
| --- | --- |
| Customer | Browses and manages their own bookings |
| Staff member | Assigned work, customer context, operational actions |
| Scheduler / front desk | Bookings across staff and resources |
| Location manager | One or more assigned locations |
| Tenant administrator | Configuration, staff access, brand, policies, integrations, reports |
| Tenant billing administrator | The tenant's SaaS plan and invoices; not necessarily customer payments |
| Platform support operator | Diagnoses tenant issues through audited, time-limited access |
| Platform operations administrator | Infrastructure, domains, releases, incidents |
| Platform super administrator | Rare break-glass role for global configuration and security operations |

## 8. Authorization model

- A `memberships` table links `auth.users` to tenants and roles.
- Permissions resolve from **current database state**, not only from long-lived JWT claims, so revocation takes effect immediately.
- JWTs identify the user. RLS and server-side authorization decide what the user may do.
- Permissions are named capabilities (`booking.cancel`, `refund.issue`, `brand.publish`), not role comparisons scattered through UI code. Roles are bundles of capabilities, which is what makes custom roles possible later.

Capability matrix (condensed; full grid in spec §4.2):

| Capability | Staff | Scheduler | Location manager | Tenant admin | Platform admin |
| --- | --- | --- | --- | --- | --- |
| View assigned calendar | Yes | Yes | Yes | Yes | Support-only |
| Create/reschedule booking | Assigned scope | Tenant scope | Location scope | Tenant scope | Support-only |
| Cancel/refund | Policy-limited | Policy-limited | Location scope | Tenant scope | No direct default |
| Manage services/resources | No | Optional | Location scope | Tenant scope | No |
| Manage staff/roles | No | No | Limited | Yes | No |
| Edit brand/content | No | No | No | Yes | Override/recovery |
| View financial reports | No | Optional | Optional | Yes | Aggregated/support-only |
| Provision/update instance | No | No | No | Request only | Yes |
| Read another tenant | Never | Never | Never | Never | Only by explicit audited grant |

## 9. Platform support access

Silent impersonation is not implemented. A support session must:

- Record tenant, operator, reason, ticket reference, approved scope, start time, expiry, and every action taken.
- Display an unmistakable support-mode banner in the UI.
- Prohibit credential and security changes.
- Write to an append-only audit trail.

See [security-and-privacy](./security-and-privacy.md) and [runbooks](./runbooks.md).

## 10. The three applications

Three independent Next.js App Router applications, chosen for security, release, and navigation boundaries.

### 10.1 Client — public white-label website

Converts visitors into valid bookings while accurately representing the tenant's brand.

Information architecture: home, services and categories, service detail, staff selection (when relevant), location selection (when relevant), availability calendar and slots, intake form, checkout, confirmation, manage booking (authenticated account or signed link), reschedule/cancel, optional customer account, and tenant-authored policy/terms/privacy/contact/accessibility pages.

Required behavior:

- Resolve the tenant from the **verified hostname**. Never trust a `tenant_id` from URL or body for authorization.
- Apply the tenant's locale, currency, timezone, policies, content, and feature flags.
- Show availability in the customer's selected timezone while clearly stating the service/location timezone.
- Make prices, taxes, deposits, cancellation terms, and approval status clear before confirmation.
- Preserve in-progress checkout with a short expiring hold.
- Support guest checkout; account creation may be offered after confirmation but is never a v1 booking gate.
- Meet WCAG 2.2 AA including keyboard, focus, error messaging, contrast, and reduced motion.
- Render LTR and RTL from the same semantic components.
- Generate tenant-specific metadata, canonical URLs, Open Graph assets, robots rules, and sitemap.

### 10.2 Dashboard — tenant staff workspace

Built to *operate* the business, not merely configure it.

Modules: Today, Calendar, Bookings, Customers, Services, Team, Resources, Availability, Payments, Communications, Reports, Brand & site, Integrations, Settings, Audit.

Rule: server-enforced scope filters apply even when the UI hides a control. Every mutation rechecks tenant membership, capability, location scope, object state, and optimistic revision.

### 10.3 Platform Admin — private control plane

Manages the white-label fleet and the commercial platform: tenant/instance registry, provisioning wizard and job timeline, repository and upstream-version status, Vercel projects and deployment history, domains and DNS/SSL verification, environment-variable and secret-reference status, brand/config validation and previews, release channels and upgrade campaigns, Supabase tenant health and quotas, email sending-domain verification, payment-provider onboarding state, calendar integration health, plans and entitlements and invoices, incident banners, support-access grants and audit logs, data export/deletion workflows, and global feature flags and kill switches.

Platform Admin is **never** copied into an instance repository. It runs on a separate hostname and Vercel project, with strict MFA, allowlisted operator accounts, short sessions, and longer audit retention.

## 11. Definition of "white-label"

A deployment is fully white-label only when it has a tenant-controlled domain, no visible platform branding, tenant identity/assets/content, correct favicon and metadata, tenant legal links, branded customer communications and reply-to behavior, and no cross-tenant leakage. Without a custom domain and branded mail, call it **branded**, not white-label.
