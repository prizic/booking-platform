# Client Laya suites

This directory owns the booking platform Client Laya suites: `client-public.json`
(public readiness, 16 scenarios), `client-empty.json` (Tenant B / empty-content
states, 4 scenarios) and `client-fault.json` (degraded catalog read, 1
scenario). `prepare-config.mjs` generates the runner configuration for one suite
at a time. The committed root `laya-test.config.json` is the default output of
that generator (public suite) and must keep the root guard values.

## Prerequisites

- Node 22 (`/tmp/booking-node22-20261013/node-v22.22.0-darwin-arm64/bin` on the
  verification machine). `scripts/prepare-booking-journey.mjs` and the workspace
  scripts assert Node 22.
- An isolated synthetic campaign database (never the retained/default project),
  with `tests/e2e/fixtures/dashboard-completion.sql` applied first, then
  `node scripts/prepare-booking-journey.mjs` to apply
  `tests/e2e/fixtures/booking-journey.sql` (brand revision 136) and record the
  seed clock. The journey fixture refuses to run without an explicit isolated
  `WLBP_SUPABASE_WORKDIR`.
- The retained stacks under `.artifacts/booking-journey-20261013/isolated`
  (API 57821 / DB 57822 / Mailpit 57824) are out of scope: do not start, reset,
  stop or seed them from this suite.

## Server profiles

Canonical ports and commands come from `scripts/journey-server-profile.ts`.
Tenant selection is by hostname through `run-with-local-supabase-env.mjs`; no
hosts-file edit is required. Warm the routes once before running (a cold
`next dev` compile can exceed the runner's navigation step timeout).

Public suite — completion fixture tenant, port 41730:

```sh
WLBP_NEXT_DIST_DIR=.next-completion-client node scripts/run-with-local-supabase-env.mjs client.dashboard-completion.example.invalid pnpm --filter @wlbp/client exec next dev --port 41730
```

Empty suite — Tenant B, port 41735:

```sh
WLBP_NEXT_DIST_DIR=.next-journey-other node scripts/run-with-local-supabase-env.mjs client.tenant-b.example.invalid pnpm --filter @wlbp/client exec next dev --port 41735
```

Fault suite — fault proxy in front of the completion tenant, port 41736:

```sh
node scripts/journey-fault-server.mjs client client.dashboard-completion.example.invalid 41736
```

## Generating the configuration

`prepare-config.mjs` writes `laya-test.config.json` at the repository root.
Select the suite with environment variables:

```sh
# public (default) -> laya-test.config.json
node tests/laya/prepare-config.mjs

# empty suite
LAYA_SUITE_FILE=client-empty.json LAYA_BASE_URL=http://localhost:41735 \
  LAYA_OUTPUT_DIR=.artifacts/booking-journey-20261014/laya-empty \
  LAYA_CONFIG_NAME=laya-test.empty.config.json node tests/laya/prepare-config.mjs

# fault suite
LAYA_SUITE_FILE=client-fault.json LAYA_BASE_URL=http://localhost:41736 \
  LAYA_OUTPUT_DIR=.artifacts/booking-journey-20261014/laya-fault \
  LAYA_CONFIG_NAME=laya-test.fault.config.json node tests/laya/prepare-config.mjs
```

Finish by regenerating the default configuration so the committed root config
keeps the public profile:

```sh
node tests/laya/prepare-config.mjs
```

The generator sets evidence permissions itself: output and campaign directories
`0700`, written configuration files `0600`.

## Running

The absolute runner path is required (it is outside this repository):

```sh
/Users/ahmed/laya-browser-agent/.venv/bin/python /Users/ahmed/laya-testing/scripts/laya_test.py \
  --config /Volumes/PortableSSD/Dev/E/projects/booking-platform/booking-platform/laya-test.config.json
```

Repeat with `--config` pointing at the generated suite configuration for the
empty and fault profiles. The runner independently executes every scenario and
assertion and retains screenshots, traces, console/network logs, action
histories, model timings and local decision counts under the configured
`output_dir`. Parent verification coordinates full execution after all
implementation streams finish.

## Coverage

Public suite (`client-public.json`):

- English and Arabic home routes, including semantic `lang` and `dir`, on
  desktop and mobile viewports with overflow checks.
- Deterministic language switching via the `اللغة` / `Language` header control.
- Services navigation in English and Arabic, including the seeded service
  headings, and the no-match search filter state.
- About and Contact fixture content in English and Arabic, footer fixture links
  (contact, legal, app stores), and Arabic phone/map/app-store values.
- Recovery form display and invalid-email typing only: `text_fixtures` supplies
  the synthetic value, no submit, no recovery request.
- Deterministic Book-now card choice on a seeded service (heading link and
  Book-now anchor share a resolved `aria-describedby` selector) ending on the
  booking title.

Empty suite (`client-empty.json`): Tenant B empty catalog on home and services,
empty About state, and positive contact-channel presence (the Tenant B contact
values are not empty, so no contact-empty scenario is claimed).

Fault suite (`client-fault.json`): catalog read failure shows the alert title,
the scoped retry control, and no empty-state rendering.

Known gap: 404 rendering is not covered. The runner treats any HTTP status ≥ 400
from `page.goto` as a hard failure, so a `not-found` scenario cannot pass under
the current runner contract. Reported as a coverage gap for the parent issue,
not skipped silently.

## Guardrails

- Root guards stay in the generated configuration: `confidence_threshold` 0.6,
  `action_retry_limit` 1, `decision_retry_limit` 0,
  `max_steps_per_scenario` 20, memory floors unchanged, `allow_state_changes`
  false, no `safe_test_origins`, no `storage_state`.
- Every step declares `until` and `allowed_controls`; each step `selector` is
  character-identical to its `allowed_controls` selector and resolves to
  exactly one element. TYPE_TEXT payloads come only from per-step
  `text_fixtures` keyed by the observed label.
- Synthetic invalid/demo data only. No credentials, tokens, raw logs,
  screenshots or traces are committed; reporting is sanitized.
- Format owned files with `pnpm exec prettier --write tests/laya` before
  handoff so `pnpm format:check` (part of `check:fast`) passes.
