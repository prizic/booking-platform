# Vercel provisioning boundary

Private control-plane code for issue #32. It is never distributed to an
instance repository.

## Runtime-only configuration

The worker reads these secret references from its platform runtime, never
from an application env file or Git:

- `VERCEL_API_TOKEN` (documented in [`../../docs/local-setup.md`](../../docs/local-setup.md#control-plane-variables--never-in-an-app-env-file))
- `VERCEL_TEAM_ID` (`team_katana` — the chosen platform deployment team)
- `GITHUB_APP_ORGANIZATION` (shared with [`../github-app/`](../github-app/README.md) — the repository the project is linked to lives in the same organization)

The Vercel GitHub App is a separately installed integration from the platform
GitHub App in [`../github-app/`](../github-app/README.md); a successful
`create_projects` call never implies the Vercel App can see the repository,
so `resolveProject`/`createOrResolveProject` surface a permission failure
distinctly from a missing-repository one.

## Behaviour

`VercelProvisioningWorker` claims one existing `vercel` provisioning step,
performs one logical operation for that step, and reports its result through
the same durable provisioning completion contract the GitHub worker uses. The
database owns retries, ordering, and idempotency — the same three properties
documented in [`../provisioning/README.md`](../provisioning/README.md) apply
here unchanged.

The four steps run in the fixed order the migration seeds them in:

1. `create_projects` — resolves-or-creates one Client and one Dashboard
   project from the seeded instance repository, rooted at `apps/client` and
   `apps/dashboard`. Resolve-before-create makes a retried create the same
   create, exactly like `seedRepository`.
2. `configure_environment` — diffs and applies environment variables per
   project by `(key, target)`. Values are never written to `observed_state`;
   only counts are.
3. `deploy_applications` — deploys both projects from the same commit SHA so
   they remain a same-commit pair, matching the requirement in issue #36 that
   Client and Dashboard promote together.
4. `verify_domains` — attaches and checks each domain. A misconfigured DNS
   record is `waiting` with reason `customer_dns` — not `failed` — because a
   tenant's DNS change takes as long as it takes.

Later steps never guess project IDs from a slug; they load the pair recorded
by `create_projects` through `vercel_projects_for_run_v1`, the same pattern
`github_repository_for_run_v1` uses for the repository identity.

## Verification

Run `pnpm test:vercel`. Real Vercel calls remain N/A until the access token
and team are configured in the protected runtime. Treat a scope, signature,
or credential event as
[R-10](../../docs/runbooks.md#r-10-compromised-provider-credential--github-app--vercel-token).

## Known gaps (ponytail: ceiling, not oversight)

- `applyEnvironment` creates and updates keys but does not delete a variable
  removed from a spec. Add a delete pass when a variable is ever retired
  rather than rotated.
- `deployApplications` reports success once Vercel accepts the deployment
  (`QUEUED`/`BUILDING`); the separate `health_check` step (provider `null` in
  the step catalog) owns confirming it actually became ready.
