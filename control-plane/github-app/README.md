# GitHub App provisioning boundary

Private control-plane code for issue #31. It is never distributed to an
instance repository.

## Runtime-only configuration

The worker reads these secret references from its platform runtime, never from
an application env file or Git:

- `GITHUB_APP_ID`
- `GITHUB_APP_PRIVATE_KEY`
- `GITHUB_APP_INSTALLATION_ID`
- `GITHUB_APP_WEBHOOK_SECRET`
- `GITHUB_APP_ORGANIZATION`

The App must be organization-owned and installed only on the intended platform
repositories. It needs the least privileges for repository administration,
contents, pull requests, checks/statuses, workflows, and webhook delivery.
The Vercel GitHub App is a separately installed integration and is checked
separately; a successful platform App call never implies Vercel can deploy.

## Behaviour

`GitHubProvisioningWorker` claims one existing `github` provisioning step,
performs at most one provider operation, and reports its result through the
durable provisioning completion contract. The database owns retries, ordering,
and idempotency. A timeout after a repository create is reconciled by resolving
the stable repository identity before another create is considered.

`GitHubWebhookIngress` verifies `x-hub-signature-256` against unmodified bytes
before parsing. It retains only the delivery ID, body SHA-256, event, action,
and repository identity. Duplicate delivery IDs do not schedule a second
reconciliation. Raw webhook bodies, headers, tokens, and credentials never
enter durable state.

Governance is compared as a canonical desired/actual fingerprint. A changed
ruleset, required check, CODEOWNERS setting, reusable-workflow pin, secret
scanning state, or dependency protection setting is drift and remains visible
until a privileged reconciliation changes it.

## Verification

Run `pnpm test:github-app`. Real GitHub calls remain N/A until the App is
installed and the runtime secret references are configured. Treat a scope,
signature, or credential event as [R-10](../../docs/runbooks.md#r-10-compromised-provider-credential--github-app--vercel-token).
