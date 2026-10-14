import {
  parsePublishedBrandContentV1,
  type PublishedBrandContentV1,
} from "@wlbp/api-contracts";
import { cache } from "react";

import {
  createPublicReadContext,
  publicRpcFailure,
  reportPublicReadFailure,
  type PublicReadFailure,
  type PublicRpcClient,
} from "./public-read-context";

export type PublishedSiteContent =
  | {
      readonly outcome: "ready";
      readonly content: PublishedBrandContentV1;
      readonly revision: number;
      readonly revisionId: string;
      readonly cacheTag: string;
    }
  | { readonly outcome: "empty" }
  | PublicReadFailure;

export async function readPublishedSiteContent(
  api: PublicRpcClient,
  hostname: string,
): Promise<PublishedSiteContent> {
  let data: unknown;
  try {
    const result = await api.rpc("get_published_brand_v1", {
      p_hostname: hostname,
      p_application: "client",
    });
    if (result.error) return publicRpcFailure(result.error);
    data = result.data;
  } catch {
    return { outcome: "error", reason: "read" };
  }
  try {
    if (!Array.isArray(data)) return { outcome: "error", reason: "parse" };
    if (data.length === 0) return { outcome: "empty" };
    const row = data[0] as Record<string, unknown> | null;
    if (
      data.length !== 1 ||
      row?.contract_version !== 1 ||
      !Number.isSafeInteger(row.revision) ||
      Number(row.revision) < 1 ||
      typeof row.brand_revision_id !== "string" ||
      typeof row.cache_tag !== "string"
    )
      return { outcome: "error", reason: "parse" };
    return {
      outcome: "ready",
      content: parsePublishedBrandContentV1(row.content),
      revision: Number(row.revision),
      revisionId: row.brand_revision_id,
      cacheTag: row.cache_tag,
    };
  } catch {
    return { outcome: "error", reason: "parse" };
  }
}

/** React cache deduplicates only within this render request. Every new request reads
 * the current published revision; there is no shared content/auth/customer cache. */
export const loadPublishedSiteContent = cache(
  async (): Promise<PublishedSiteContent> => {
    const context = await createPublicReadContext();
    const result =
      context.outcome === "error"
        ? context
        : await readPublishedSiteContent(context.api, context.hostname);
    if (result.outcome === "error") reportPublicReadFailure("brand", result);
    return result;
  },
);
