# Platform test suites

Fleet-wide, provisioning, concurrency, and upgrade-fixture tests live here and
remain platform-only. Package-local unit tests live beside their packages;
distributed test helpers live in `packages/testing` and contain no privileged
fixtures.

`e2e/` contains the executable issue #4 browser foundation: English/Arabic
application smoke checks, automated WCAG A/AA checks, semantic RTL assertions,
and screenshots attached as CI evidence. Issue #5 expands this foundation into
component, interaction, responsive, and maintained visual-regression coverage;
issue #6 adds the tenant-resolution, SSR, and cache-isolation matrix.

Contract compatibility fixtures are synthetic and live in `fixtures/contracts/`.
The deliberately incompatible fixture must be rejected by
`pnpm test:contract`; it is evidence that the gate fails closed, not a supported
release.

The other reserved platform-only suites remain explicit rather than simulated:

- `concurrency/` is implemented with the booking RPCs in issue #11.
- `provisioning/` is implemented with control-plane automation in issue #28.
- `upgrade-fixtures/` is implemented with the distribution pipeline in issue #29.
