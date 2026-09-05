import type { NextConfig } from "next";
import { loadInstanceBrand } from "@wlbp/config/instance-brand";

const instanceBrand = loadInstanceBrand(import.meta.dirname);

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), geolocation=(), microphone=()",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

const nextConfig: NextConfig = {
  distDir: process.env.WLBP_NEXT_DIST_DIR ?? ".next",
  env: {
    WLBP_BRAND_CONFIG_JSON: instanceBrand.serialized,
  },
  output: "standalone",
  poweredByHeader: false,
  productionBrowserSourceMaps: false,
  reactStrictMode: true,
  transpilePackages: [
    "@wlbp/api-contracts",
    "@wlbp/auth",
    "@wlbp/config",
    "@wlbp/i18n",
    "@wlbp/supabase-client",
    "@wlbp/tenant-resolution",
    "@wlbp/ui-foundation",
    "@wlbp/white-label-ui",
  ],
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
