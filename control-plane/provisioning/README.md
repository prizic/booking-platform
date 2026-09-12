# Provisioning boundary

Private, replayable provisioning jobs. Never distributed.

## Where the state machine lives

In the database, not in a worker. `control_plane.provisioning_runs` holds one
run per instance and `control_plane.provisioning_steps` holds its ordered steps,
each with its own status, attempt count, stable idempotency key, the provider's
stable external ID once known, a sanitized error code and a retry time.

That placement is the whole design. Provisioning is a sequence of calls to other
people's APIs, and every one of them can time out _after_ having succeeded. A
worker that holds the sequence in a local variable has nowhere to resume from
when it is restarted mid-run, and no way to tell a duplicate response from a
second resource. Because the sequence is rows, resuming is a query.

## The three properties worth knowing

**Waiting is not failing.** A tenant's DNS change takes as long as it takes. A
run blocked on one is `waiting` with a reason and a retry time — not `failed`,
which invites a destructive retry, and not `active`, which invites traffic to a
domain that resolves nowhere. A wait does not spend an attempt, so a slow
customer cannot exhaust a retry budget.

**A retry is the same call, not another one.** Each step carries one idempotency
key for its whole life, presented to the provider on every attempt. A step that
already succeeded is never re-run, and re-reporting its success returns
`duplicate` rather than creating a second resource.

**Rollback deactivates; it never deletes.** `deactivate_instance_v1` suspends
the instance and flips desired state to inactive. There is no `DELETE` in it. A
half-provisioned repository holds the tenant's configuration and a
half-provisioned domain holds their DNS; deleting either turns a recoverable
incident into an unrecoverable one.

## Activation is a gate, not a step

`activate_instance_v1` re-checks every requirement at the moment it is called —
required steps, environment fingerprint, release match, backend contract, domain
verification, published brand — and returns the list of reasons it refused. An
operator who has to discover blockers one deploy at a time stops checking.

## What the worker is allowed to be

Narrow. It claims a step, calls one provider with short-lived scoped
credentials, and reports the outcome. It holds no sequencing logic, because the
sequence is in the rows, and it stores no secret in `observed_state`, because a
check constraint refuses anything shaped like one.

Claim and complete are refused to any session carrying an end-user identity.
That is deliberate: otherwise an operator could mark the health check succeeded
from a browser and activate an instance nobody checked.

The provider calls themselves belong to issues #31 (GitHub App) and #32
(Vercel). Operator procedure is [R-15](../../docs/runbooks.md#r-15-stuck-waiting-or-drifted-provisioning-run).
