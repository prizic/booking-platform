import type { Locale } from "@wlbp/i18n";
import {
  createInstanceText,
  parseInstanceContent,
  type InstanceText,
} from "@wlbp/white-label-ui/instance-content";

/*
 * Tenant-facing text comes only from the instance folder
 * (instance/content/ar.json and en.json), loaded by next.config.ts.
 */
const serializedContent = process.env.WLBP_INSTANCE_CONTENT_JSON;
if (!serializedContent) {
  throw new Error("WLBP_INSTANCE_CONTENT_JSON was not supplied by next.config.ts");
}

const instanceContent = parseInstanceContent(JSON.parse(serializedContent));

export function instanceText(locale: Locale): InstanceText {
  return createInstanceText(instanceContent, locale);
}
