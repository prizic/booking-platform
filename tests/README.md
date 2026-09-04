# Platform test suites

Fleet-wide, provisioning, concurrency, and upgrade-fixture tests live here and
remain platform-only. Package-local unit tests live beside their packages;
distributed test helpers live in `packages/testing` and contain no privileged
fixtures.
