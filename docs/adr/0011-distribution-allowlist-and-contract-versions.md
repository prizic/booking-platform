# ADR-0011: Distribution allowlist, contract versions, and locale URLs

- **Status:** Accepted
- **Owner:** @SEIFSEIF4
- **Date:** 2026-09-04
- **Supersedes / Superseded by:** —

## Context

Issue #3 bootstraps the private monorepo and the three application shells. It cannot be executed as written, because four things it depends on have never been decided.

**1. The allowlist has no members.** [architecture.md](../architecture.md) says the distributed tree contains `packages/ # approved distributable packages only`. [customization-boundaries.md](../customization-boundaries.md) §6 repeats the phrase. [upstream-updates.md](../upstream-updates.md) §2 step 3 says the sanitized tree is built from an explicit **allowlist, never a denylist**, and [engineering-rules.md](../engineering-rules.md) §1 says platform-only packages are "denied by the distribution allowlist and verified absent in export CI". No document anywhere names a single package on either side of that line. An allowlist nobody has enumerated is a denylist with extra words, and it is exactly the failure mode step 3 was written to prevent. Issue #3's acceptance criterion "Client and Dashboard can be selected as a distributable dependency closure without Platform Admin or privileged control-plane code" is not testable until the closure is written down.

**2. `supabase-client` cannot be classified as it currently exists.** Both [architecture.md](../architecture.md) and [engineering-rules.md](../engineering-rules.md) §1 state: *only `supabase-client` constructs Supabase clients; user-scoped and privileged clients are distinct types*. [architecture.md](../architecture.md) also requires "a completely separate privileged client available only to controlled server/worker code, never to Client or Dashboard". Those two rules put one package on both sides of the distribution boundary at once:

- If `supabase-client` ships, service-role client-construction code lands in every tenant instance repository. That contradicts SI-4 in [security-and-privacy.md](../security-and-privacy.md) ("service/secret keys never enter white-label applications or any instance repository"), engineering rule 2, and [instance-docs-contract.md](../instance-docs-contract.md) §5.1, which forbids "any instruction to use a Supabase service-role or secret key, in either application, in any file, for any reason". Construction code is an instruction.
- If it does not ship, Client and Dashboard have no browser client and no per-request SSR client, and neither app can render a page.

The same shape applies to every package that holds a provider SDK or a credential path: `integrations` (Stripe, Google, Microsoft adapters) and `email` (Resend).

**3. The compatibility contract has no home.** [AGENTS.md](../../AGENTS.md), issue #3's handoff, [engineering-rules.md](../engineering-rules.md) §12, and [instance-docs-contract.md](../instance-docs-contract.md) §8.10 all require reporting the current `whiteLabelVersion`, `configSchemaVersion`, and `backendContract`. Before this decision, [upstream-updates.md](../upstream-updates.md) could only illustrate the field shape, so every report still had to guess the real values.

**4. The locale URL scheme is undecided.** [architecture.md](../architecture.md) requires "locale-aware URLs and metadata" and English/Arabic parity, and every cache key must include locale. It never says whether the default locale is prefixed. Every route file created by issue #3 encodes that answer in its directory layout, so it is decided by whoever types first unless it is decided here.

This ADR is required rather than optional: [adr/README.md](./README.md) lists "the distribution boundary — what a white-label instance may change, and what stays upstream" as one of five decisions that **must** carry an ADR.

## Decision

### A. The distribution allowlist

1. The distribution tree is produced from the allowlist below. A workspace member absent from this table is **platform-only by default**; there is no implicit inclusion, and adding a member does not silently extend the tree.

| Workspace member | Side | Reason |
| --- | --- | --- |
| `apps/client` | **distributed** | One of the two shipped tenant surfaces. |
| `apps/dashboard` | **distributed** | The other shipped tenant surface. |
| `apps/platform-admin` | platform-only | The control-plane UI; §10.1 and every trust-boundary row keep it private. |
| `packages/booking-domain` | **distributed** | Framework-independent rules the two apps need to render and pre-validate; holds no credential and no network call. |
| `packages/api-contracts` | **distributed** | The versioned `api_v1` request/response types both apps compile against; being distributed is the point of the contract. |
| `packages/supabase-client` | **distributed** | After the split in §B: anonymous browser and per-request user-scoped SSR clients only. |
| `packages/supabase-admin` | platform-only | After the split in §B: the sole constructor of the service-role client. Never distributable, at any tier. |
| `packages/auth` | **distributed** | Reads the verified identity (`getClaims()`) and evaluates capabilities from membership rows through RLS. Contains no privileged escalation path and no user-administration call. |
| `packages/tenant-resolution` | **distributed** | Hostname normalization and lookup through a public tenant-scoped RPC; the apps cannot boot without it, and it grants nothing on its own. |
| `packages/ui-foundation` | **distributed** | Accessible primitives with no tenant opinion; rendered by both apps. |
| `packages/white-label-ui` | **distributed** | Maps `instance/brand.json` tokens onto the primitives; it is the customization surface. |
| `packages/i18n` | **distributed** | Message-key resolution, RTL, locale formatting. English/Arabic parity is unreachable if this stays private. |
| `packages/email` | platform-only | Holds the Resend SDK and the sending identity. Mail is sent by an Edge worker off the outbox, never from a booking Server Action, so no distributed surface imports it. |
| `packages/integrations` | platform-only | Holds payment, calendar, and provider SDKs plus their credential paths. Distributed code reaches provider outcomes through `api-contracts` types and versioned RPCs. |
| `packages/observability` | **distributed** | Correlation IDs and PII redaction helpers, which are most needed in the two apps. Carries no provider secret; reporter endpoints come from environment values, not from code. |
| `packages/testing` | **distributed** | Instance CI runs unit, contract, E2E, a11y, and forbidden-import tests, so its helpers must ship. It must contain no privileged fixture, no service-role helper, and no production seed; it may not depend on `supabase-admin`. |
| `packages/config` | **distributed** | Shared TypeScript, lint, and build base configs; instance CI cannot run without them. |
| `supabase/**` | platform-only | Migrations, RLS, functions, and seeds. Rule zero: an instance repository never authors or runs a migration. |
| `control-plane/**` | platform-only | Provisioning, distribution, upgrade bot, contracts. Never distributed, by definition. |
| `instance-template/**` | generator input | Not shipped as itself; it is rendered into the `instance/`, `docs/`, `.platform/`, and `AGENTS.md` content of a new instance repository. |
| `tests/**` | platform-only | Fleet, concurrency, provisioning, and upgrade-fixture suites operate on the whole fleet and reference platform state. |

2. Distribution is a **dependency closure**, not a file copy: a distributed member may depend only on distributed members. A `dependencies` or `devDependencies` edge from any distributed member to any platform-only member fails CI at the boundary-lint step, before export runs.

3. Adding a member to, or removing a member from, this table **requires an ADR that supersedes this one**. It is not a pull-request decision, and it is not something the export script may be edited to work around.

### B. Splitting `supabase-client`

4. `packages/supabase-client` is distributed and may construct exactly two client types: the **anonymous browser client** (publishable/anonymous key only) and the **per-request server client** bound to request/response cookies and scoped to the signed-in user. It has no code path that reads a service-role key, and no exported symbol that accepts one.

5. `packages/supabase-admin` is platform-only and is the **only** place in the workspace that constructs the service-role client. It is `server-only`, and its exports are typed distinctly from the user-scoped clients so the two can never be passed interchangeably.

6. Import rights are fixed:

| Importer | `supabase-client` | `supabase-admin` |
| --- | --- | --- |
| `apps/client` | yes | **no** |
| `apps/dashboard` | yes | **no** |
| `apps/platform-admin` | yes | yes |
| `control-plane/**`, `supabase/functions/**` | yes | yes |
| any other package | no — `@supabase/*` stays behind these two | no |

7. The split is enforced twice, mechanically:
   - **Forbidden-import lint rule** — the existing `@supabase/*` rule from [engineering-rules.md](../engineering-rules.md) §1 is retargeted at both packages, and a second rule denies `supabase-admin` (and `server-only` privileged modules generally) from `apps/client` and `apps/dashboard`. Runs in both platform CI and instance CI.
   - **Distribution export test** — the export/dependency-closure check asserts that `supabase-admin` appears nowhere in the exported tree or its Git history, alongside the existing secret and Platform Admin scans ([upstream-updates.md](../upstream-updates.md) §2 steps 3–4). A hit blocks the release.

8. `email` and `integrations` are **not** split. They land wholly platform-only, because unlike Supabase clients they have no legitimate distributed caller: [architecture.md](../architecture.md) requires that no provider is ever called inside the booking transaction and that email leaves through the outbox and an Edge worker. Anything a distributed surface needs to *know* about a provider outcome — payment status, calendar link, delivery state — is a versioned field in `api-contracts`, not an SDK call. If a distributed surface ever genuinely needs provider behaviour, the answer is a new field on a versioned contract, not a distributed slice of these packages.

### C. Contract versions

9. `whiteLabelVersion`, `configSchemaVersion`, and `backendContract` live in **one committed file at the repository root, `platform-contract.json`**, and nowhere else. Every other appearance — a generated `instance/manifest.json`, a release manifest, `docs/UPSTREAM_UPDATE_GUIDE.md`, an agent handoff report — is stamped from this file, never hand-typed.

10. Its exact shape and initial values:

```json
{
  "whiteLabelVersion": "0.1.0",
  "configSchemaVersion": 1,
  "backendContract": { "min": 1, "max": 1 }
}
```

Three keys, no others. `whiteLabelVersion` is a semver string matching the `tenant-runtime-vMAJOR.MINOR.PATCH` tag; `configSchemaVersion` is a positive integer; `backendContract` is `{ "min": integer, "max": integer }` with `min <= max`, inclusive at both ends. A schema check on this file runs in CI.

11. Who may change what:

| Field | Changed by | How |
| --- | --- | --- |
| `whiteLabelVersion` | The release pipeline only | Bumped by the release job that cuts and tags `tenant-runtime-*`. Never edited in a feature pull request. |
| `configSchemaVersion` | Platform owner (@SEIFSEIF4) | In the same pull request that changes the `instance/` configuration schema, with the generated before/after migration required by [upstream-updates.md](../upstream-updates.md) §3. |
| `backendContract` | Platform owner (@SEIFSEIF4) | **Any change to the range — widening or narrowing — requires an ADR.** Narrowing is additionally a breaking release per [engineering-rules.md](../engineering-rules.md) §12 and may not land while a live instance still declares dependence on the dropped version. |

12. `0.1.0` is honest about pre-release status: nothing is deployed, and it signals that no compatibility promise has been made yet. `configSchemaVersion 1` and `backendContract { min: 1, max: 1 }` are the smallest legal values — one schema exists and one backend contract generation exists, so no range is available to lie about.

### D. Locale URLs

13. Locale is **always path-prefixed**. Every user-facing route in Client and Dashboard lives under `/{locale}/...` where `{locale}` is `en` or `ar`. There is no unprefixed default: `/services` is not a route, `/en/services` and `/ar/services` are.

14. `/` is a redirect, never a rendered page. It issues a 308 to `/{locale}` where the locale is negotiated from `Accept-Language` restricted to the instance's supported locales, falling back to the instance's declared default from `instance/manifest.json`. Redirect targets are validated against the supported-locale list; an unknown prefix is a 404, not a silent fallback.

15. Every localized page emits `hreflang` alternates for both locales plus `x-default`, and the sitemap lists both prefixed URLs. Locale remains a required component of every tenant cache key per [engineering-rules.md](../engineering-rules.md) §2.

16. Changing this scheme later rewrites all routing: every route directory, every internal link, every canonical and `hreflang` tag, every cache key, every sitemap entry, and every E2E path assertion, in every instance repository in the fleet simultaneously. It is not a configuration value and is not exposed in `instance/`.

### Alternatives rejected

- **Ship `supabase-client` whole and rely on the instance never setting the service-role environment variable.** Rejected: it puts privileged construction code and the shape of its key inside every tenant repository, so the only thing standing between a leak and a fleet-wide isolation failure is one unset variable and an agent that read the documentation. [instance-docs-contract.md](../instance-docs-contract.md) §5.1 already forbids even an *instruction* to use such a key.
- **Keep one package, split by entry point (`/browser`, `/server`, `/admin`).** Rejected: the export test would have to reason about subpath reachability and bundler tree-shaking rather than about package identity, and deep-import bans already exist precisely because subpath boundaries are weak. Package identity is a boundary a script can check without executing a bundler.
- **A denylist of forbidden paths instead of an allowlist.** Rejected explicitly by [upstream-updates.md](../upstream-updates.md) §2 step 3: a denylist fails open, so every new package is distributed until someone remembers to forbid it.
- **Put the contract versions in the root `package.json` under a custom key.** Rejected: `package.json` is rewritten by package managers and version-bump tooling, which would make an unreviewed contract change look like routine dependency churn.
- **Derive `whiteLabelVersion` from the Git tag at build time instead of committing it.** Rejected: a local checkout, an instance repository, and an agent handoff all need the value without access to the platform tag history.
- **Unprefixed default locale (`/services` = English, `/ar/services` = Arabic).** Rejected: it makes English structurally primary, which is the exact second-class-language outcome the parity rule exists to prevent; it creates duplicate-content pairs needing canonical tags on every page; and it forces an ambiguity check on every path segment ("is this a locale or a route?") in middleware and in every link helper.
- **Domain or subdomain per locale (`ar.tenant.example`).** Rejected: it doubles the domain-verification, certificate, and cutover work per instance for a fleet where every tenant is bilingual by default.

## Consequences

### Positive

- Issue #3's acceptance criterion "Client and Dashboard can be selected as a distributable dependency closure without Platform Admin or privileged control-plane code" becomes mechanically checkable on day one, against a table rather than against someone's memory.
- The distribution boundary fails **closed**: a package created next month is platform-only until an ADR says otherwise, so forgetting to classify it is safe.
- SI-4 gains a structural guarantee instead of a procedural one. No file in a tenant repository knows how to build a privileged client, so the worst case of a leaked service-role key stops being "the app uses it".
- `platform-contract.json` gives the agent handoff, the instance manifest generator, and the release manifest one place to read, so the three can no longer disagree.
- Path-prefixed locales make English and Arabic structurally identical: one route tree, one cache-key shape, no canonical-tag maintenance, and RTL is reachable at a URL from the first commit.

### Negative / cost

- This ADR required [architecture.md](../architecture.md) and [engineering-rules.md](../engineering-rules.md) §1 to distinguish the user-scoped `supabase-client` from platform-only `supabase-admin`; those corrections are now part of the accepted knowledge pack.
- Two Supabase packages is more workspace surface than one: two `package.json` files, two build targets, two sets of tests, and a code reviewer who must notice which one an import came from — mitigated by the lint rule, but the lint rule is now load-bearing.
- Platform Admin imports both packages, so it is the one place where a privileged and a user-scoped client sit in the same module graph. Its own boundary tests carry more weight than the other two apps'.
- Distributing `testing` and `config` means instance repositories can read platform test helpers and lint configuration. That is intended, but it widens the surface an instance could try to weaken locally; `.platform/customization-policy.json` and the pinned central reusable workflow are what stop it, not the package boundary.
- `0.1.0` and `{ min: 1, max: 1 }` mean there is no compatibility window at all: the first backend contract change must widen the range before any instance exists, or it is a breaking change against the first instance ever provisioned.
- Path-prefixed locales cost a redirect hop on every bare-domain visit, and every internal link must carry a locale, so a hand-written `href="/services"` is now a bug rather than a working default. That needs a link helper and a lint rule to catch reliably.
- Adding a package to the allowlist is now ADR-weight work, which will feel heavy the first time someone splits an existing distributed package in two for ordinary refactoring reasons.

## Revisit triggers

- A distributed surface has a concrete need for provider SDK behaviour that no `api-contracts` field can express — the platform-only placement of `integrations` or `email` is then wrong, and the split treatment in §B applies to it.
- The export/dependency-closure check finds `supabase-admin`, `platform-admin`, `control-plane`, or `supabase/migrations` in an exported tree or its history — the boundary leaked and both the allowlist and its enforcement need re-derivation before the next release.
- A new package is proposed for the workspace that does not obviously fall on one side, or an existing distributed package is asked to hold a credential path.
- `backendContract` is asked to widen or narrow for the first time, which by clause 11 is itself an ADR.
- A third locale, or a locale that is not a two-letter code, enters scope — the negotiation and fallback rules in clause 14 were written for exactly two.
- A tenant requires a locale-specific domain for legal or marketing reasons, which reopens the rejected per-domain alternative.
- The fleet reaches the shared-deployment threshold described in [architecture.md](../architecture.md) under Control plane, at which point a config-only fleet mode may not need a per-instance dependency closure at all.

## References

- [Architecture spec](../../WHITE_LABEL_BOOKING_PLATFORM_PRODUCT_ARCHITECTURE.md) — §10.1–§10.3, §10.5–§10.7, §12, §13.1–§13.2, §13.6, §22.1, §30
- [Architecture overview](../architecture.md) — monorepo layout, package rules, distribution boundary
- [Customization boundaries](../customization-boundaries.md) — §6 what is distributed to an instance
- [Upstream updates](../upstream-updates.md) — §2 allowlist-based export, §4 compatibility range contract
- [Instance docs contract](../instance-docs-contract.md) — §5.1 prohibitions, §8 acceptance checklist
- [Security and privacy](../security-and-privacy.md) — SI-4, SI-8, secret placement
- [Engineering rules](../engineering-rules.md) — §1 package rules, §12 compatibility and migration rule
- [ADR-0012: Instance ownership and support tiers](./0012-instance-ownership-and-support-tiers.md)
- [ADR index](./README.md)
- [References](../references.md)
