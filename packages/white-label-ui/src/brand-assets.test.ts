import { describe, expect, it } from "vitest";

import { parseBrandAssets, resolveBrandAssets } from "./index.js";

const completeAssets = {
  logoLight: "/assets/logo-light.svg",
  logoDark: "/assets/logo-dark.svg",
  icon: "/assets/icon.svg",
  favicon: "/assets/favicon.svg",
  socialImage: "/assets/social.png",
};

describe("brand assets", () => {
  it("selects the requested logo and preserves public asset metadata", () => {
    expect(resolveBrandAssets(completeAssets, "dark")).toEqual({
      logo: "/assets/logo-dark.svg",
      icon: "/assets/icon.svg",
      favicon: "/assets/favicon.svg",
      socialImage: "/assets/social.png",
    });
    expect(resolveBrandAssets(completeAssets, "light").logo).toBe(
      "/assets/logo-light.svg",
    );
  });

  it("falls back to the declared light logo when a dark asset is absent", () => {
    const assets = { ...completeAssets, logoDark: undefined };

    expect(parseBrandAssets(assets)).toEqual(assets);
    expect(resolveBrandAssets(assets, "dark").logo).toBe("/assets/logo-light.svg");
  });

  it("rejects remote, traversing, and executable asset references", () => {
    for (const unsafeLogo of [
      "https://tracker.example/logo.svg",
      "/assets/../private.svg",
      "javascript:alert(1)",
      "data:image/svg+xml,unsafe",
    ]) {
      expect(() =>
        parseBrandAssets({ ...completeAssets, logoLight: unsafeLogo }),
      ).toThrow(/logoLight/u);
    }
  });

  it("rejects unknown asset keys instead of accepting configuration code", () => {
    expect(() => parseBrandAssets({ ...completeAssets, selector: "body" })).toThrow(
      /unexpected key/u,
    );
  });
});
