# Local demo data (synthetic)

`platform-admin-demo.sql` populates the control plane of the **isolated**
`platform-admin-20261006` stack with clearly synthetic tenants, runs, jobs,
releases, rollouts, health observations, support grants and audit history.

- Run only through `node scripts/platform-admin-local.mjs seed`, which creates the
  four demo operator accounts first and refuses any stack but the isolated one.
- Never part of `seed.sql` or any migration; never applied by `db reset` or a deploy.
- Re-running is safe: fixed IDs, `ON CONFLICT`, and time-relative values refreshed.
- Every name contains "Synthetic demo" and every email ends in `.example.invalid`.

Login details are saved in ignored `.artifacts/platform-admin/credentials.json`
with owner-only permissions. Run `node scripts/platform-admin-local.mjs code admin`
(or `admin2`, `operator`, `viewer`) immediately before signing in for a current
six-digit authenticator code. The helper refuses missing or unsafe credentials.
Keep passwords, authenticator secrets and codes out of logs and screenshots.
