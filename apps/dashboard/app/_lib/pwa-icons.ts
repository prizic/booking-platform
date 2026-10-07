import type { MetadataRoute } from "next";

/*
 * Generated from the brand icon by packages/config/instance-brand.mjs
 * (`pwaIconDirectory`) on every build and dev start; see docs/pwa.md.
 */
const directory = "/assets/_pwa";

export const pwaAppleTouchIcon = `${directory}/apple-touch-icon.png`;

type ManifestIcon = NonNullable<MetadataRoute.Manifest["icons"]>[number];

export const pwaManifestIcons: readonly ManifestIcon[] = Object.freeze([
  {
    src: `${directory}/icon-192.png`,
    sizes: "192x192",
    type: "image/png",
    purpose: "any",
  },
  {
    src: `${directory}/icon-512.png`,
    sizes: "512x512",
    type: "image/png",
    purpose: "any",
  },
  {
    src: `${directory}/maskable-192.png`,
    sizes: "192x192",
    type: "image/png",
    purpose: "maskable",
  },
  {
    src: `${directory}/maskable-512.png`,
    sizes: "512x512",
    type: "image/png",
    purpose: "maskable",
  },
]);
