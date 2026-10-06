# Dashboard staff access contract — Task 7

This bounded central subtask supplements the completion plan. Historical issue
#8 owns staff profiles, not login administration. No new capability or custom
role is introduced. Implementation and its tests await Task 22 verification.

- Actor: current active membership with direct tenant-scoped `staff.manage`.
  Location managers may keep using the existing eligibility operations but
  cannot invite, revoke, or change roles. Administrator role changes additionally
  require recent AAL2 and the existing `tenant.owner_transfer` capability.
- Read: one minimized versioned workspace containing built-in roles, named
  locations, members (display name/email, status, revision, assigned locations),
  invitations (email, role, status, expiry, revision, delivery state).
- Mutations: invite, resend, revoke invitation, edit/revoke membership. Every
  request includes a UUID request ID; reusing a request with different input
  fails. Existing targets use compare-and-swap revisions. Tenant serialization
  prevents concurrent removal/demotion of the final active administrator. A
  trigger protects this condition on all underlying write paths.
- Delivery: a private leased job references the invitation, never a browser
  token. Only the internally authenticated platform worker can claim/complete
  jobs and call Auth Admin. It generates a single-use Auth link, delivers through
  Resend, and stores no plaintext token/provider body. A committed invitation
  remains pending when delivery fails; resend creates a fresh delivery attempt.
- Acceptance: provider OTP verification establishes identity. The central
  acceptance RPC locks the pending invitation, compares its normalized email
  with the verified Auth user's confirmed email, checks expiry and active tenant,
  and writes the membership/scopes atomically. Replay returns the same member;
  revoked/expired/other-email invitations fail closed. A normal password session
  never establishes membership without the matching pending invitation.
- Audit: append-only metadata identifies actor, effective actor, tenant, target,
  operation, request ID, timestamp, and redacted role/status/location changes;
  it contains no email, token, secret, provider payload, or user metadata.
- Tests: admin success; anonymous/staff/location-manager/revoked/cross-tenant
  denial; stale revision and idempotency mismatch; final-admin safety; invitation
  expiry/replay/email mismatch; worker grant separation; unchanged staff-profile
  and future-allocation behavior. Browser/provider evidence remains separate.
