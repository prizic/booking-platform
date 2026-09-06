# Pinned web fonts

Client and Dashboard ship the three variable WOFF2 faces in their public
trees, and the instance template carries the same files for generated builds.
The runtime only uses same-origin `/fonts/*.woff2` URLs; it never calls a font
host. Each redistributed file has its SIL Open Font License 1.1 text beside it.

| Family | Roles | Weights |
| --- | --- | --- |
| Inter | English body and display | 100–900 |
| Noto Sans Arabic | Arabic body and fallback | 100–900 |
| Noto Naskh Arabic | Arabic display | 400–700 |

Brand token validation requires the first family in each semantic stack to be
one of these shipped families and rejects a requested weight outside its range.
Generic CSS families are permitted only as the final fallback. This keeps
tenant customization inside the brand-token boundary while removing
operating-system fallback from the normal path.

`docs/fonts/provenance.json` records the upstream source, license, conversion,
SHA-256, distribution paths, and canonical Linux render environment. After an
intentional font update, regenerate the WOFF2 assets from the upstream sources,
copy identical bytes to all three distribution paths, then run:

```sh
pnpm fonts:provenance
pnpm check:fonts
```

Visual references are platform-specific. Generate Linux references only in the
pinned `ubuntu-24.04` workflow with the Playwright-managed Chromium from the
lockfile. Upload actual and diff artifacts for review, and promote Linux
snapshots only after review. Darwin snapshots remain a developer reference and
are kept separate by filename.
