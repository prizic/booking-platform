# Instance Documentation Contract

Purpose: define exactly which documentation a generated tenant instance repository must contain, where each file comes from, and what it may never contain.

Authoritative source: §12.1, §12.2 and §10.3 of [the architecture spec](../WHITE_LABEL_BOOKING_PLATFORM_PRODUCT_ARCHITECTURE.md).

Related: [docs/README.md](./README.md) · [architecture](./architecture.md) · [glossary](./glossary.md) · [engineering rules](./engineering-rules.md) · [security and privacy](./security-and-privacy.md) · [release scope](./release-scope.md) · [customization boundaries](./customization-boundaries.md) · [design system](./design-system.md) · [upstream updates](./upstream-updates.md) · [local setup](./local-setup.md) · [runbooks](./runbooks.md) · [references](./references.md) · [ADRs](./adr/README.md)

> Scope note: this document describes the docs shipped **into a generated tenant instance repository**. It is not the index for this platform repository — that is [docs/README.md](./README.md).

---

## 1. Principle

Every newly created instance repository ships an instruction pack that makes **safe customization the easiest path**. Platform Admin generates it **deterministically** from tenant and release metadata. A human never hand-writes an instance doc; if a fact is wrong, the generator or its inputs are wrong.

---

## 2. Required files

| File | Purpose | Generated from | Hash-verified |
| --- | --- | --- | --- |
| `AGENTS.md` | Non-negotiable instructions auto-discovered by coding agents | Release template + tenant metadata + `.platform/customization-policy.json` | Yes |
| `docs/WHITE_LABEL_AGENT_BRIEF.md` | Tenant goal, audience, languages, pages, features, brand direction | Tenant record + brand record in control plane | Yes |
| `docs/ARCHITECTURE.md` | App and package boundaries, data flow | Release architecture template at `baseRelease` | Yes |
| `docs/CUSTOMIZATION_BOUNDARIES.md` | Allowed, conditional, and forbidden paths for this instance | `.platform/base.json` + `.platform/customization-policy.json` + support tier | Yes |
| `docs/DESIGN_SYSTEM.md` | Tokens, components, responsive/RTL/accessibility rules | Release token schema + `instance/brand.json` + supported locales | Yes |
| `docs/FEATURE_FLAGS.md` | Entitlements and valid configuration | Plan entitlements + `instance/features.json` schema | Yes |
| `docs/LOCAL_SETUP.md` | Safe setup using non-production environment references | Release setup template + non-production reference names only | Yes |
| `docs/VERIFICATION_CHECKLIST.md` | Exact commands plus the human acceptance checklist | Release task graph + instance app set | Yes |
| `docs/UPSTREAM_UPDATE_GUIDE.md` | Versioning, conflict resolution, escape hatches | Release manifest + `whiteLabelVersion` / `backendContract` range | Yes |

Every one of these files is generated, hash-verified, and regenerated on upgrade. None is a free-text field.

### Supporting configuration referenced by the docs

| File | Role |
| --- | --- |
| `instance/manifest.json` | Tenant/instance IDs, upstream version, config schema version, supported locales |
| `.platform/base.json` | The pristine baseline the instance delta is computed against |
| `.platform/customization-policy.json` | Machine-enforced allowed/forbidden path rules |

---

## 3. Generated-file metadata

Every generated file carries this metadata block, and CI verifies it:

| Field | Meaning |
| --- | --- |
| `schemaVersion` | Version of the generated-doc schema itself |
| `tenantId` | The tenant this pack belongs to |
| `baseRelease` | The `tenant-runtime-*` release the pack was generated from |
| `generatorVersion` | Which generator produced it — makes drift diagnosable |
| Content hash | Hash of the rendered content |

### Hash discipline

- **Commit a generated file only when its content hash changes.** Regenerating identical content must produce no diff — a doc pack that churns on every run trains reviewers to ignore it.
- On upgrade, the generator re-renders the pack at the new `baseRelease`; changed hashes appear inside the upstream-update pull request described in [upstream updates](./upstream-updates.md).
- A hash mismatch against committed content means the file was hand-edited. CI treats that as a failure, not a warning.

---

## 4. Minimum `AGENTS.md` contract

The generated `AGENTS.md` must communicate all of the following, in direct language:

| Section | Must state |
| --- | --- |
| Mission | Customize Client and Dashboard for the tenant in `docs/WHITE_LABEL_AGENT_BRIEF.md` while preserving platform compatibility |
| Read before changing code | Read the brief, architecture, customization boundaries, design system, feature flags, local setup, and verification checklist completely |
| Safe change order | (1) `instance/` configuration, content, features, assets, approved theme tokens; (2) a documented extension slot; (3) shared core only with explicit platform-owner approval and a written reason why (1) and (2) do not work |
| Never do these | The prohibitions in §5 below |
| Invariants | The invariants in §6 below |
| Before handing off | Run format, lint, typecheck, unit, contract, build, E2E, accessibility, localization, forbidden-import, and config-validation tasks; report changed files, behavior, test evidence, assumptions, remaining risks, and current white-label/backend contract versions |

The real generated file additionally contains the exact commands, the allowed directory list for this instance, tenant-specific requirements, and preview expectations.

---

## 5. Prohibitions

### 5.1 What the generated pack must never contain

A generated instance pack contains **no credentials**. Specifically it must never include:

- Any secret, provider token, API key, or example key that could be mistaken for a real one
- **Any instruction to use a Supabase service-role or secret key**, in either application, in any file, for any reason
- **Any migration authority** — no migration files, no migration commands, no implication that this repository may alter shared production schema
- Production data, production dumps, or unnecessary personal information
- Platform Admin source, control-plane code, or inferences about their private implementation
- **Ambiguous use of `tenant`, `brand`, and `instance`** — these are three distinct concepts and the generator must never use them interchangeably; see [glossary](./glossary.md)

Export CI scans the generated tree **and its history** for all of the above. A hit blocks distribution.

### 5.2 What the pack must instruct agents never to do

- Never add Platform Admin code or infer its private implementation.
- Never add or run Supabase production migrations from this repository.
- Never use a Supabase service or secret key in either app.
- Never trust a hostname, URL parameter, form value, JWT user metadata, or hidden UI control as authorization.
- Never bypass RLS, booking RPCs, price calculation, idempotency, webhook verification, or payment state reconciliation.
- Never put secrets, real customer data, provider tokens, or production dumps in Git, tests, screenshots, logs, or AI prompts.
- Never remove RTL, keyboard, focus, contrast, mobile, or error-state behavior.
- Never install a dependency without checking license, maintenance, security, bundle impact, and whether an existing package already solves the need.

---

## 6. Invariants the pack must assert

- Only Client and Dashboard are shipped in this repository.
- Tenant identity comes from verified deployment configuration and is revalidated by server and database authorization.
- All booking and capacity changes go through versioned atomic backend contracts.
- Runtime entitlements override local feature configuration.
- Existing bookings keep their policy, price, duration, and intake snapshots.
- English and Arabic must remain functionally equivalent.

---

## 7. What else ships alongside the docs

The instance repository receives generated **public** Supabase URL/key references and safe generated API types. It does not receive a service key, provider secret, Platform Admin source, control-plane worker, or production migration authority. The full distributed tree is listed in [customization boundaries](./customization-boundaries.md).

---

## 8. Acceptance checklist for a generated pack

A pack is acceptable only when all of the following are true:

1. All nine required files exist at their exact paths.
2. Every file carries `schemaVersion`, `tenantId`, `baseRelease`, `generatorVersion`, and a content hash.
3. Re-running the generator on unchanged inputs produces zero diff.
4. Secret, credential, and service-role-instruction scans over the tree and its history are clean.
5. No migration file, migration command, or migration authority exists anywhere in the repository.
6. `tenant`, `brand`, and `instance` are used with their glossary meanings throughout.
7. `AGENTS.md` states the safe change order with configuration first and shared-core changes as an approved exception.
8. `docs/VERIFICATION_CHECKLIST.md` commands actually run in this repository at this release.
9. `docs/LOCAL_SETUP.md` references non-production environments only.
10. `docs/UPSTREAM_UPDATE_GUIDE.md` records the current `whiteLabelVersion`, `configSchemaVersion`, and `backendContract` range.

Failures here are release-blocking; see [release scope](./release-scope.md) and [runbooks](./runbooks.md).
