import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  // Preserve same-origin form Origin headers; never disclose referrers cross-site.
  { key: "Referrer-Policy", value: "same-origin" },
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
  poweredByHeader: false,
  distDir: process.env.PLATFORM_ADMIN_DIST_DIR ?? ".next",
  productionBrowserSourceMaps: false,
  reactStrictMode: true,
  transpilePackages: [
    "@wlbp/auth",
    "@wlbp/config",
    "@wlbp/i18n",
    "@wlbp/supabase-client",
    "@wlbp/ui-foundation",
  ],
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
