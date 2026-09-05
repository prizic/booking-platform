import { describe, expect, it } from "vitest";

import { neutralBrandTokens } from "./brand-tokens.js";
import { parseBrandConfig } from "./brand-config.js";

const validConfig = {
  name: "Example Booking",
  assets: {
    logoLight: "/assets/logo-light.svg",
    logoDark: "/assets/logo-dark.svg",
    icon: "/assets/icon.svg",
    favicon: "/assets/favicon.svg",
    socialImage: "/assets/social.svg",
  },
  tokens: neutralBrandTokens,
};

describe("parseBrandConfig", () => {
  it("parses the complete public brand definition", () => {
    expect(parseBrandConfig(validConfig)).toMatchObject({
      name: "Example Booking",
      assets: validConfig.assets,
      tokens: neutralBrandTokens,
    });
  });

  it("fails closed on unexpected top-level configuration", () => {
    expect(() => parseBrandConfig({ ...validConfig, selector: "body" })).toThrow(
      /unexpected key/u,
    );
  });
});
