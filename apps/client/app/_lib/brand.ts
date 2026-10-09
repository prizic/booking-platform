import { parseBrandConfig } from "@wlbp/white-label-ui/brand-config";

const serializedBrand = process.env.WLBP_BRAND_CONFIG_JSON;
if (!serializedBrand) {
  throw new Error("WLBP_BRAND_CONFIG_JSON was not supplied by next.config.ts");
}

export const clientBrand = parseBrandConfig(JSON.parse(serializedBrand));
