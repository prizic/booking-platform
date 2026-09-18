# GitHub App instance-repository provisioning design

**Issue:** #31 — Seed and govern instance repositories through a GitHub App

## Goal

Make the private control plane able to replayably create and govern a managed
logical-fork repository using an organization-owned GitHub App, while retaining
the durable step state machine introduced in issue #30.

## Scope and boundary

The implementation lives only under `control-plane/github-app/`, with tests in
the same private boundary and the existing database provisioning contracts.
It is never exported by the distribution allowlist. It consumes a claimed
GitHub provisioning step, performs exactly its named external operation, and
reports a sanitized result through `complete_provisioning_step_v1`.

This issue does not implement the Vercel calls in #32, the generated instruction
pack in #33, customization-tier CI in #34, or upgrade PR automation in #35.
It also does not perform live mutations until an organization-owned GitHub App
is installed and its runtime secret references have been supplied.

## Decisions

### Credentials and permissions

The adapter authenticates by exchanging an App JWT for a short-lived
installation access token. App ID, private key, webhook secret, organization,
and installation ID are runtime-only secret references. They are never written
to provisioning state, logs, fixtures, documentation output, or the generated
instance repository.

The adapter validates its installation's visible repository scope before every
mutation. It requests only repository administration, contents, pull requests,
checks/statuses, workflows, and webhook-management capabilities required by the
provisioning step. A missing permission or out-of-scope target fails the step
before the operation is attempted.

### Repository lifecycle

The `create_repository`, `seed_repository`, `commit_configuration`, and
`protect_repository` steps remain the source of order and retry state. The
GitHub worker resolves by stable repository ID when one is recorded; otherwise
it resolves the expected private repository name in the configured organization
before creating it. A timeout after creation is reconciled by resolving the
repository, never by creating another one.

Seeding uses only the approved sanitized release artifact and records the
distribution release, tree checksum, default branch, repository node/REST ID,
and commit SHA as sanitized observation data. It must reject any export that
does not pass the existing distribution checks. Configuration and generated
files are committed idempotently by content/tree identity, rather than making
an identical second commit.

### Governance

Governance is declarative: required checks, default-branch protections,
CODEOWNERS review requirements, secret scanning, dependency protections, and
the pinned reusable instance workflow are represented by a versioned desired
state fingerprint. A reconciliation read detects manual changes and produces
a visible drift result; it does not silently weaken a rule. The Vercel GitHub
App access check is distinct from the platform App installation check.

### Webhooks and reconciliation

Webhook ingress verifies the GitHub signature against the unmodified raw body
before parsing it. It stores/canonicalizes a delivery using the GitHub delivery
identifier, acknowledges rapidly, and enqueues reconciliation through the
durable provisioning mechanism. Duplicate and out-of-order deliveries are
no-ops; the webhook handler does not directly mutate repository state.

## Interfaces

`GitHubAppClient` is an injected boundary whose operations are typed around
stable GitHub identifiers and sanitized observations. Its concrete transport
holds the App credentials in memory only. Test doubles implement the same
interface and model success, timeout-after-success, rate limit/backoff,
installation removal, repository rename, ruleset drift, and duplicate webhook
delivery.

`GitHubProvisioningWorker` maps a claimed GitHub step to one client operation
and one result report. It never chooses the next step, changes an instance's
desired state, or bypasses the database claim lock.

`GitHubWebhookIngress` accepts raw bytes and headers, returns an acknowledgement
after durable canonicalization, and passes only the delivery identity and safe
event metadata to reconciliation.

## Error handling

Transient GitHub failures produce the existing retryable provisioning outcome
with bounded exponential backoff and jitter. A `Retry-After` value is respected
when present. DNS/customer-action waiting remains a waiting outcome. Permission,
signature, export-integrity, and unsupported-governance failures are explicit
non-retryable sanitized codes. No raw GitHub response, authorization header,
JWT, private key, webhook body, source tree, or customer data may enter an
error, metric, audit payload, or alert.

## Verification

The test suite will prove idempotent create/seed/configure/protect behavior,
timeout-after-create reconciliation, short-lived scoped token handling,
missing permission/installations, rate limits, renamed repositories, ruleset
drift, Vercel App access absence, webhook signature rejection, duplicate and
out-of-order webhook delivery, worker restart, and sanitization/redaction.

Existing source gates, database provisioning tests, distribution closure/history
scans, and secret-shape checks remain mandatory. Live GitHub API verification
is explicitly N/A until the organization-owned App installation and runtime
secret references exist.

## Risks and assumptions

- The authenticated personal GitHub account can inspect and push to this source
  repository, but cannot substitute for the organization-owned App required by
  the issue.
- GitHub's exact ruleset and security-feature availability varies by plan and
  organization policy. The adapter will surface unsupported settings as visible
  drift/blocked outcomes, not treat them as successfully governed.
- The release artifact must be produced by the existing allowlist exporter; no
  private repository history or control-plane source is eligible for seeding.
