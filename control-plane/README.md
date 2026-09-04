# Private control plane

This tree is platform-only. It is excluded from every white-label distribution
by [ADR-0011](../docs/adr/0011-distribution-allowlist-and-contract-versions.md).

The directories reserve ownership without pretending that their later issues
are implemented:

- `provisioning/` owns replayable instance, project, and domain provisioning.
- `distribution/` owns allowlist-driven instance exports.
- `upgrade-bot/` owns fleet upgrade proposals and reconciliation.
- `contracts/` owns backend compatibility-range evaluation.

No Client or Dashboard workspace may depend on anything in this tree.
