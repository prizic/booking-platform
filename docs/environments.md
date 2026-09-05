# Environments and backend releases

How local development, staging, and production are separated; how their
identity is verified; and how the private platform pipeline changes the shared
Supabase backend without giving instance repositories migration authority.

Authoritative source: §9.3, §10.5–§10.8, §24.4–§24.6, and §31 of
[the architecture spec](../WHITE_LABEL_BOOKING_PLATFORM_PRODUCT_ARCHITECTURE.md).

Related: [local setup](./local-setup.md) · [architecture](./architecture.md) ·
[engineering rules](./engineering-rules.md) · [security and privacy](./security-and-privacy.md) ·
[runbooks](./runbooks.md) · [upstream updates](./upstream-updates.md)

---

## 1. Environment topology

The launch topology has one shared, row-isolated Supabase project per
environment. “Shared” means all tenants in that environment use the same
project; it does not weaken the `tenant_id`, RLS, grant, and composite-key
requirements.

| Environment | Supabase unit | Data allowed | Deploy authority | Purpose |
| --- | --- | --- | --- | --- |
| Local/development | One Docker-backed stack per developer or CI job, identified by committed `supabase/config.toml` | Deterministic synthetic data only | The developer or isolated CI job | Migration authoring, reset-from-zero, database tests, application development |
| Staging | One hosted shared project | Synthetic tenants only; never a production clone or dump | Protected `staging` GitHub environment | Release rehearsal, integration tests, preview applications, migration timing |
| Production | One hosted shared project | Customer data plus a clearly marked synthetic monitoring tenant with no live-provider side effects | Protected `production` GitHub environment with human approval | Live applications and post-promotion health checks |

Client, Dashboard, and Platform Admin in one environment point only at that
environment’s backend. Provider test/sandbox accounts are separate from live
provider accounts. A staging URL, key, webhook, queue, bucket, or email domain
must never route to production.

A dedicated Supabase project for one enterprise tenant remains an exception
that requires an infrastructure-contract decision and the same central
migration discipline. It is not a second launch topology.

## 2. Environment identity, not credentials

Automation compares a canonical, non-secret environment descriptor before a
release. The issue #4 protected workflow computes its fingerprint from the
exact UTF-8 JSON serialization
`{"environment":"<staging-or-production>","supabaseProjectRef":"<20-character-project-ref>"}`.
It compares that computed value with both the protected environment variable
and the reviewed dispatch input before linking the CLI. A changed project
reference therefore cannot retain a valid fingerprint. The fuller control-plane
descriptor records:

- environment name and protected GitHub environment name;
- stable Supabase project reference/ID and region;
- PostgreSQL major version;
- current backend contract version and applied release ID;
- Client and Dashboard project/deployment IDs and logical pair ID;
- a SHA-256 fingerprint of the canonical descriptor.

The fingerprint detects “right release, wrong project” mistakes; it does not
authenticate anything. Store the expected descriptor and fingerprint in the
control plane/release record. Logs and operator screens show stable IDs and
fingerprints, never credentials.

| Name | Classification | Storage |
| --- | --- | --- |
| `SUPABASE_PROJECT_REF` | Stable environment identifier, not an authentication secret | Protected environment variable / control-plane descriptor |
| `ENVIRONMENT_FINGERPRINT` | `sha256:` plus the lowercase SHA-256 of the canonical JSON environment/project descriptor above | Protected environment variable / control-plane descriptor |
| `SUPABASE_ACCESS_TOKEN` | Privileged deployment credential | Protected environment secret only |
| `SUPABASE_DB_PASSWORD` | Privileged database credential | Protected environment secret only |
| `RECOVERY_EVIDENCE_ID` | Non-secret reference to the latest independently reviewed backup/PITR status evidence | Protected production environment variable / release record |
| `RECOVERY_VERIFIED_AT` | Exact UTC timestamp for that recovery review, refreshed within 24 hours of a production migration | Protected production environment variable / release record |
| `NEXT_PUBLIC_SUPABASE_URL` | Browser-safe project URL | App environment storage, scoped by environment |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Browser-safe, RLS-constrained key | App environment storage, scoped by environment |

The service-role key, provider credentials, access token, database password,
webhook bodies, and customer data never appear in a descriptor, fingerprint,
release manifest, repository, CI output, screenshot, or AI prompt. Local keys
printed by the CLI remain local and uncommitted.

Hosted project creation is an operator step. Until stable IDs and fingerprints
exist in the control plane and protected environment, hosted deployment is
intentionally unavailable; local and pull-request CI do not require hosted
credentials.

## 3. Local development contract

The committed `supabase/` tree is the reproducible backend source:

- `config.toml` pins local services, ports, PostgreSQL major version, and the
  single exposed application schema, `api_v1`;
- `migrations/` is the ordered central migration history;
- `seed.sql` is deterministic and synthetic-only;
- `tests/database/` is the pgTAP entry point;
- `functions/` is the platform-only Edge Function source surface.

The headless issue #4 stack disables optional Studio, Storage, and Realtime
containers. This avoids treating an unused dashboard or untested bucket/
publication as part of the foundation contract. An owning feature issue must
enable each service together with its grants, RLS, and positive/negative tests.

The initial migration creates only the `api_v1`, `app`, and `private` schema
boundaries. Issue #6 owns tenant/domain tables, explicit object grants, RLS
policies, multi-tenant fixtures, and the complete positive/negative access
matrix.

Use the workspace wrappers from the repository root:

```bash
pnpm supabase:start
pnpm db:reset
pnpm test:db
pnpm db:lint
pnpm supabase:stop
```

`pnpm db:reset` is local-only and may destroy the local Docker database. Never
add `--linked`, a hosted database URL, or production credentials to that
wrapper. Resetting staging or production is prohibited.

Create every migration through the pinned CLI before editing it:

```bash
pnpm exec supabase migration new <descriptive_name>
```

After a migration, reset from zero, run pgTAP, lint the database, inspect the
migration list, and run `pnpm check:db-types`. The pull request includes the
generated safe `api_v1` application types; `app` and `private` types are never
distributed.

## 4. Hosted release path

Pull-request CI starts an isolated local stack and receives no hosted
credentials. Hosted changes happen only after merge through one serialized
private workflow per target environment.

1. Verify the release manifest, migration dependency chain, and migration
   checksums against the committed tree.
2. Acquire the environment-specific concurrency lock. Another backend release
   waits; migrations are never applied concurrently.
3. Resolve the target by stable project reference and compare its descriptor
   fingerprint with the approved release input.
4. For production, independently verify the expected PITR/backup state and
   record its evidence ID and exact UTC timestamp in both the protected
   environment and reviewed dispatch inputs. The workflow refuses mutation
   when those values differ or the evidence is more than 24 hours old. Also
   record the release owner, last healthy application pair, and compatible
   backend range. This is an operator evidence gate, not a claim that the
   workflow can infer backup health from a database connection.
5. Link the CLI inside the protected job and inspect remote/local migration
   history. Do not link a developer workstation as the production release path.
6. Apply pending migrations once, then verify the recorded migration list and
   run safe post-migration contract probes.
7. Deploy platform-owned Edge Functions only after their deterministic source
   checksums are part of the release manifest. The issue #4 workflow fails
   closed when it discovers a function entry point because that manifest
   extension is not implemented yet.
8. Build Client and Dashboard from one commit, deploy them, and record their two
   deployment IDs as one logical release pair.
9. Promote only after both applications pass health, contract, security-header,
   and synthetic smoke checks. Record the resulting release and environment
   fingerprints.

An instance repository cannot perform steps 1–7. It never contains migrations,
functions, privileged workflow credentials, or a hosted database deployment
job.

## 5. Expand/contract and forward repair

Database changes follow this sequence:

1. **Expand:** add backward-compatible objects or nullable fields and explicit
   grants/RLS.
2. **Backfill or dual-write:** use bounded, observable work that can resume.
3. **Deploy:** move all supported Client/Dashboard pairs onto the new contract.
4. **Observe:** wait through the documented deprecation window and verify fleet
   contract telemetry.
5. **Contract:** remove an old shape only when no supported release uses it.

Never change the shape of a published versioned view or RPC; publish the next
version. A database release that fails is repaired forward with a reviewed
migration or compensating job. Do not edit an already-applied migration, delete
migration history, restore production merely to undo code, or run a destructive
schema rollback. A point-in-time restore is a disaster-recovery decision for
data loss/corruption, not an ordinary deployment tool.

Application rollback is different: both application domains may return to the
last healthy Client/Dashboard pair only when its backend range includes the
current expanded contract. Keep the expanded schema in place.

## 6. Environment and build-time changes

Vercel environment changes affect future deployments only. After changing even
a browser-safe variable:

1. update desired state and its fingerprint;
2. trigger new Client and Dashboard builds from the same source commit;
3. verify both deployments against the intended backend descriptor;
4. promote and record them as one pair.

Previous deployments retain their old build-time values. Before redirecting to
an older pair, compare its recorded environment fingerprint and backend range;
an otherwise healthy build may target an old project or incompatible contract.
Never mutate a production variable and assume an already-built deployment now
uses it.

## 7. Gate maturity

Issue #4 establishes the runnable local reset, schema-boundary pgTAP smoke, and
CI surfaces. Issue #6 adds the tenant/RLS matrix and safe type-drift gate. These
later gates must remain explicit in handoffs until their owning issues land:

| Gate | Current report |
| --- | --- |
| Full tenant/RLS matrix and cross-tenant negative cases | Available — issue #6 |
| Safe `api_v1` generated-type drift | Available — issue #6 |
| Booking concurrency suite | `N/A — not yet implemented, owned by issue #11` |
| Complete customer/staff E2E journeys | `N/A — not yet implemented, owned by issues #12–#18` |
| Full accessibility, RTL interaction, and visual matrix | `N/A — not yet implemented, owned by issues #5 and #40` |
| Provisioning replay against GitHub/Vercel/domain state | `N/A — not yet implemented, owned by issues #30–#32` |
| Instance upgrade fixtures against a published distribution | `N/A — not yet implemented, owned by issues #29, #34, and #35` |

An executable foundation smoke may pass without implying that a later product
coverage gate exists.

## 8. Operator checklist for a new hosted environment

1. Create a new Supabase project in the intended organization and region; do
   not reuse or clone production for staging.
2. Record its stable project reference/ID, region, and PostgreSQL major version.
3. Create the protected GitHub environment and add credentials by name through
   the secret store, never through a commit or issue.
4. Record the canonical descriptor fingerprint and verify it from the protected
   workflow.
5. For production, record the latest successful backup/PITR check as
   `RECOVERY_EVIDENCE_ID` and its canonical ISO timestamp (for example,
   `2026-09-05T12:00:00.000Z`) as `RECOVERY_VERIFIED_AT`; pass the same reviewed
   values when dispatching within 24 hours.
6. Apply the central migration history through the serialized pipeline.
7. Load synthetic fixtures only in staging. Never import a production dump.
8. Configure provider sandbox endpoints and verify no route reaches a live
   provider.
9. Run reset-from-zero locally/CI, hosted contract probes, application builds,
   and the applicable release gates before enabling promotion.

See [R-14](./runbooks.md#r-14-backend-release-or-environment-identity-failure)
for a failed migration, checksum mismatch, or environment fingerprint mismatch.
