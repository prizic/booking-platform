# Config schema 2 → 3: fully validated PNG brand assets

Schema 3 removes tenant-authored SVG and other browser-active formats from the
public brand surface. A same-origin SVG can execute script when opened directly,
so every declared asset is now a non-symlink regular PNG below the canonical
`instance/assets/` root. Startup verifies PNG chunks and checksums, bounded
dimensions, decompressed pixel rows, and the file-size limit before copying an
in-memory validated snapshot into Client or Dashboard.

## Before (schema 2)

Schema 2 permitted SVG paths:

```json
{
  "assets": {
    "logoLight": "/assets/logo-light.svg",
    "logoDark": "/assets/logo-dark.svg",
    "icon": "/assets/icon.svg",
    "favicon": "/assets/favicon.svg",
    "socialImage": "/assets/social.svg"
  }
}
```

## Convert the files

Decode and re-encode each source image with a trusted image tool. Do not only
rename an SVG or change its extension: schema 3 checks the actual bytes and will
reject that file.

- Every asset role accepts PNG only. Use a non-interlaced PNG with a standard
  PNG color encoding. Strip EXIF, text, and other metadata chunks before adding
  the file; the validator rejects them so location, author, device, or customer
  information cannot be published with the image.
- Light and dark logos are limited to 2,000,000 bytes, 4,096 pixels per
  dimension, and 8,000,000 total pixels. `logoDark` remains optional.
- Icon and favicon files are limited to 1,000,000 bytes, 1,024 pixels per
  dimension, and 1,000,000 total pixels. Social images are limited to 8,000,000
  bytes, 4,096 pixels per dimension, and 16,000,000 total pixels.
- Keep every file below `instance/assets/` as a regular file. Symlinked files,
  symlinked directories, directories named like images, and paths outside the
  canonical asset root are rejected.

## After (schema 3)

After conversion, update the complete `assets` object as follows:

```json
{
  "assets": {
    "logoLight": "/assets/logo-light.png",
    "logoDark": "/assets/logo-dark.png",
    "icon": "/assets/icon.png",
    "favicon": "/assets/favicon.png",
    "socialImage": "/assets/social.png"
  }
}
```

Delete the obsolete SVG files after confirming that no content or metadata file
still references them. If `logoDark` was omitted in schema 2, it may remain
omitted; the light logo remains the dark-mode fallback.

Finally, stamp `configSchemaVersion` from the repository-root
`platform-contract.json`, run `pnpm check:config`, and build both Client and
Dashboard. The check fully parses and decompresses each converted file; a PNG
signature or matching extension by itself is not sufficient.
