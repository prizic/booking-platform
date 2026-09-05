import { parsePublicSiteOrigin } from "@wlbp/config";

export function getClientSiteOrigin(
  configuredOrigin = process.env.NEXT_PUBLIC_SITE_URL,
  nodeEnvironment = process.env.NODE_ENV,
): URL {
  return parsePublicSiteOrigin(
    configuredOrigin,
    nodeEnvironment === "production" ? undefined : "http://localhost:3000",
  );
}
