# Release and backend compatibility contracts

`release-contracts.mjs` validates the root platform contract, constructs a
deterministic distribution-release manifest, and rejects malformed or
unsupported backend combinations. `platform-contract.json` remains the sole
authority for the white-label version, configuration-schema version, and
backend contract range; generated manifests are stamped from it.

Generate a manifest by supplying a full Git commit and a reviewed release-notes
JSON file:

```text
node scripts/generate-release-manifest.mjs <full-git-commit> <release-notes.json>
```

The generator writes JSON to standard output. Release automation should capture
that output as an artifact and validate it before signing:

```text
node scripts/check-release-contracts.mjs <release-manifest.json>
```

The release-notes input contains exactly `featureNotes`, `upgradeNotes`, and
`migrationDependencies`. Migration SQL is read from the central `supabase/`
tree; its SHA-256 checksums are calculated by the generator and never accepted
from the notes file.
