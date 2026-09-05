import { describe, expect, it } from "vitest";

import { parseBrandAssets, resolveBrandAssets } from "./index.js";

const completeAssets = {
  logoLight: "/assets/logo-light.png",
  logoDark: "/assets/logo-dark.png",
  icon: "/assets/icon.png",
  favicon: "/assets/favicon.png",
  socialImage: "/assets/social.png",
};

describe("brand assets", () => {
  it("selects the requested logo and preserves public asset metadata", () => {
    expect(resolveBrandAssets(completeAssets, "dark")).toEqual({
      logo: "/assets/logo-dark.png",
      icon: "/assets/icon.png",
      favicon: "/assets/favicon.png",
      socialImage: "/assets/social.png",
    });
    expect(resolveBrandAssets(completeAssets, "light").logo).toBe(
      "/assets/logo-light.png",
    );
  });

  it("falls back to the declared light logo when a dark asset is absent", () => {
    const assets = { ...completeAssets, logoDark: undefined };

    expect(parseBrandAssets(assets)).toEqual(assets);
    expect(resolveBrandAssets(assets, "dark").logo).toBe("/assets/logo-light.png");
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

  it("rejects SVG and every other non-PNG asset format", () => {
    for (const key of Object.keys(completeAssets)) {
      expect(() =>
        parseBrandAssets({ ...completeAssets, [key]: `/assets/${key}.svg` }),
      ).toThrow(new RegExp(key, "u"));
    }
    expect(() =>
      parseBrandAssets({ ...completeAssets, socialImage: "/assets/social.html" }),
    ).toThrow(/socialImage/u);
    for (const extension of ["jpg", "jpeg", "webp", "ico"]) {
      expect(() =>
        parseBrandAssets({
          ...completeAssets,
          socialImage: `/assets/social.${extension}`,
        }),
      ).toThrow(/socialImage/u);
    }
  });
});
