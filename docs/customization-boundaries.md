# Customization Boundaries

Purpose: define how far a tenant instance may be customized, by which path, and what support each path buys.

Authoritative source: §11 and §10.3, §10.8 of [the architecture spec](../WHITE_LABEL_BOOKING_PLATFORM_PRODUCT_ARCHITECTURE.md).

Related: [docs/README.md](./README.md) · [architecture](./architecture.md) · [glossary](./glossary.md) · [engineering rules](./engineering-rules.md) · [security and privacy](./security-and-privacy.md) · [release scope](./release-scope.md) · [upstream updates](./upstream-updates.md) · [design system](./design-system.md) · [ADRs](./adr/README.md)

---

## 1. The three-path rule

Every customization request takes the highest applicable path. Paths are ordered. You may not skip down a path because it is faster to type.

### Path 1 — Configuration first (the SAFE path)

Change files under `instance/` only. Most tenants should require zero edits outside `instance/`.

- Fully supported.
- Eligible for automated upstream upgrade pull requests.
- No conflict budget consumed.
- Validated by JSON Schema/Zod at local build, CI, provisioning, and runtime startup.

If configuration can express the request, configuration is the answer. Stop here.

### Path 2 — Formal extension slots (the SECOND path)

Use a documented, typed extension slot under `instance/extensions/` when configuration genuinely cannot express the request.

- Supported, but only through the declared slot contract (see §4).
- Still upgrade-eligible, subject to the slot's compatibility version.
- Requires the slot to already exist upstream. If no slot fits, the correct move is to request a new slot upstream — not to edit core.
- Arbitrary tenant JavaScript is out of scope, at any tier.

### Path 3 — Shared-core changes (an EXPLICITLY APPROVED EXCEPTION)

Editing distributed application or package code outside `instance/` is an exception, not a tier you opt into silently.

- Requires explicit platform-owner approval, recorded before the change lands.
- The request must state why no configuration and no extension solution works.
- Moves the instance to the **Extended code** support tier: manual upgrade review, a conflict budget, and a **different update and support SLA**.
- Approval is per change, not a standing licence.

> Never solve fleet divergence by letting every instance edit core files freely. If a customization repeats across tenants, promote it upstream into a feature flag, design token, content field, or formal extension slot.

---

## 2. Support tiers

| Tier | May touch | May not touch | Upgrades | Support |
| --- | --- | --- | --- | --- |
| **Config-only** | `instance/brand.json`, `instance/content/*.json`, `instance/features.json`, `instance/navigation.json`, `instance/theme.css`, `instance/assets/`, approved extension slots, provider settings | Anything under `apps/`, `packages/`, `supabase/`, `.platform/`; auth, tenant resolution, booking transactions, payment verification | Automated upgrade PRs | Standard SLA |
| **Extended code** | Application edits permitted by `.platform/customization-policy.json`, after explicit approval | Platform Admin source, control-plane code, migrations, secrets, service-role usage, RLS bypass — forbidden at every tier | Manual review, conflict budget | Different update/support SLA |

Enforcement is mechanical, not advisory: CI computes the instance delta against `.platform/base.json` and enforces `.platform/customization-policy.json`, CODEOWNERS, and GitHub rulesets. Agent instructions guide behavior but are **not** a security control — see [security and privacy](./security-and-privacy.md).

---

## 3. Configuration ownership map

Each `instance/` file owns a bounded concern. Putting a value in the wrong file is a boundary violation even though it is still "configuration".

| File | Owns | Does not own |
| --- | --- | --- |
| `manifest.json` | Tenant/instance IDs, upstream version, config schema version, supported locales | Secrets, mutable runtime status |
| `brand.json` | Names, logos, colors, typography, radius, favicon, social imagery | CSS selectors, arbitrary code |
| `features.json` | Allowed feature toggles and module settings | Plan entitlements by itself |
| `navigation.json` | Approved routes, order, labels | Arbitrary external scripts |
| `content/en.json`, `content/ar.json` | Localized copy, SEO, contact details, empty states, policy references | Design tokens, unsafe HTML, secrets |
| `theme.css` | Approved CSS custom properties | Global selectors that break component semantics |
| `assets/` | Optimized PNG brand assets that pass structure, checksum, dimensions, decompression, and size validation | Symlinks, non-PNG or active content, customer PII, credentials |
| `extensions/` | Explicit typed slots | Replacing auth, tenant resolution, booking transactions, payment verification |

**Entitlement rule:** runtime entitlements come from the backend. Editing `features.json` can only disable or configure a capability the tenant is already entitled to. It can never unlock a paid or unsafe feature. See [release scope](./release-scope.md) for which capabilities exist in the release at all — a flag can never turn on something that is not built.

---

## 4. Extension slot contract

Supported slot categories:

- Client home sections and service-card decorations
- Booking intake components backed by a declared schema
- Confirmation-page informational panels
- Dashboard home widgets and read-only booking panels
- Read-only provider outcome panels supplied through versioned, platform-owned contracts; instance code never loads a provider SDK, credential, webhook handler, or adapter

Every extension must declare all of the following, or it is not a valid extension:

| Requirement | Meaning |
| --- | --- |
| Typed input/output contract | Compile-time checked against the slot definition |
| Error boundary | A failing extension never takes down the surrounding surface |
| Permissions list | Explicit capabilities it requires |
| Server/client classification | Where it is allowed to execute |
| Performance budget | Bundle and runtime cost ceiling |
| Accessibility test | Automated check in the instance verification matrix |
| Compatibility version | Which upstream slot version it targets |

---

## 5. Content and policy versioning

Customization of copy and policy is versioned data, not a code edit.

- Content and policy have **draft** and **published** versions.
- Rich text is sanitized; only an allowlist of components may render.
- Each booking snapshots price, tax, duration, buffers, cancellation terms, consent text, and intake schema at the time it was made.
- Existing bookings keep their snapshots after the tenant edits current policy. Editing policy never rewrites history.
- Legal pages carry published timestamps and locale-specific versions.
- Deactivating a staff member or resource must inspect future allocations and force an explicit migration decision.

---

## 6. What is distributed to an instance

An instance repository receives:

```text
apps/client, apps/dashboard      # the two shipped surfaces
packages/                        # approved distributable packages only
instance/                        # generated tenant configuration (the customization surface)
docs/                            # generated instance operating guides
.platform/base.json, .platform/customization-policy.json
AGENTS.md, turbo.json, pnpm-workspace.yaml, package.json, pnpm-lock.yaml
```

It also receives generated public Supabase URL/key **references** and safe generated API types.

It never receives, and must never gain:

- A Supabase service or secret key, or any instruction to use one
- Provider secrets of any kind
- Platform Admin source, or any control-plane worker
- Production migration authority — an instance repository can never run a shared production migration

See [upstream updates](./upstream-updates.md) for how a distributed tree is produced and refreshed, and [instance docs contract](./instance-docs-contract.md) for the generated documentation set.

---

## 7. Definition of "white-label"

A deployment is **fully white-label** only when all of the following hold:

- Tenant-controlled custom domain
- No visible platform branding anywhere in the Client surface
- Tenant identity, assets, and content throughout
- Correct favicon and tenant-specific metadata
- Tenant legal links (terms, privacy, policy, accessibility)
- Branded customer communications with correct reply-to behavior
- No cross-tenant leakage of data, assets, or metadata

Until a custom domain **and** branded mail are both in place, describe the deployment as **branded**, not fully white-label. This distinction is contractual language, not marketing preference. Terminology is defined once in the [glossary](./glossary.md); *tenant*, *brand*, and *instance* are never synonyms.

---

## 8. Decision checklist

Before writing any customization:

1. Can `instance/` configuration express this? → do that, stop.
2. Does an existing extension slot cover it? → use the slot, stop.
3. Is this the third tenant asking? → request it upstream as a flag, token, content field, or new slot.
4. Still nothing? → request explicit platform-owner approval, and record the justification; accept the Extended code tier.

Escalation, verification commands, and rollout consequences live in [runbooks](./runbooks.md), [local setup](./local-setup.md), and [references](./references.md).
