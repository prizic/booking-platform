import type { PublishedBrandContentV1 } from "@wlbp/api-contracts";

/** Receives only the allowlisted, validated public content DTO. */
export function publicChannelLinks(contact: PublishedBrandContentV1["contact"]) {
  return {
    email: contact?.email
      ? `mailto:${encodeURIComponent(contact.email).replace("%40", "@")}`
      : undefined,
    phone: contact?.phone ? `tel:${contact.phone}` : undefined,
    whatsapp: contact?.whatsapp
      ? `https://wa.me/${contact.whatsapp.slice(1)}`
      : undefined,
  };
}
