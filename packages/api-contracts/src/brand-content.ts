/** Additive, public fields of an existing published brand revision. */
export interface LocalizedBrandTextV1 {
  readonly en: string;
  readonly ar: string;
}

export interface PublishedBrandContentV1 {
  readonly title?: LocalizedBrandTextV1;
  readonly contact?: {
    readonly email?: string;
    readonly phone?: string;
    readonly whatsapp?: string;
  };
  readonly about?: {
    readonly experience?: LocalizedBrandTextV1;
    readonly whyChooseUs?: LocalizedBrandTextV1;
    readonly address?: LocalizedBrandTextV1;
    readonly mapUrl?: string;
  };
  readonly appStores?: {
    readonly appStoreUrl?: string;
    readonly googlePlayUrl?: string;
  };
  readonly legal?: {
    readonly privacyUrl?: string;
    readonly termsUrl?: string;
  };
}

export function isSafeBrandHttpsUrlV1(value: unknown): value is string {
  if (
    typeof value !== "string" ||
    value.length > 2048 ||
    /[\s<>\\]/u.test(value) ||
    Array.from(value).some(
      (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
    ) ||
    !/^https:\/\/[A-Za-z0-9.-]+(?::[0-9]{1,5})?(?:[/?#][^\s<>\\]*)?$/u.test(value)
  ) {
    return false;
  }
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.hostname !== "" &&
      url.username === "" &&
      url.password === ""
    );
  } catch {
    return false;
  }
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("brand_invalid_content");
  }
  return value as Record<string, unknown>;
}

function plainText(value: unknown, max: number): string {
  if (
    typeof value !== "string" ||
    value.trim() === "" ||
    value.length > max ||
    /<[a-z/!]|javascript:|data:text\/html|vbscript:|\son[a-z]+\s*=|&#x?[0-9a-f]+;/iu.test(
      value,
    )
  ) {
    throw new Error("brand_invalid_content");
  }
  return value;
}

function localized(value: unknown, max: number): LocalizedBrandTextV1 {
  const input = record(value);
  return Object.freeze({ en: plainText(input.en, max), ar: plainText(input.ar, max) });
}

/** Strictly validate recognized fields; project away legacy/unknown fields.
 * Applications must never spread the untrusted input into their public DTO. */
export function parsePublishedBrandContentV1(value: unknown): PublishedBrandContentV1 {
  const input = record(value);
  const output: {
    title?: LocalizedBrandTextV1;
    contact?: NonNullable<PublishedBrandContentV1["contact"]>;
    about?: NonNullable<PublishedBrandContentV1["about"]>;
    appStores?: NonNullable<PublishedBrandContentV1["appStores"]>;
    legal?: NonNullable<PublishedBrandContentV1["legal"]>;
  } = {};
  if (input.title !== undefined) output.title = localized(input.title, 160);
  if (input.contact !== undefined) {
    const c = record(input.contact);
    const contact: { email?: string; phone?: string; whatsapp?: string } = {};
    if (c.email !== undefined) {
      const email = plainText(c.email, 320);
      if (!/^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/u.test(email))
        throw new Error("brand_invalid_content");
      contact.email = email;
    }
    for (const key of ["phone", "whatsapp"] as const) {
      if (c[key] !== undefined) {
        if (typeof c[key] !== "string" || !/^\+[1-9][0-9]{6,14}$/u.test(c[key]))
          throw new Error("brand_invalid_content");
        contact[key] = c[key];
      }
    }
    output.contact = Object.freeze(contact);
  }
  if (input.about !== undefined) {
    const a = record(input.about);
    const about: {
      experience?: LocalizedBrandTextV1;
      whyChooseUs?: LocalizedBrandTextV1;
      address?: LocalizedBrandTextV1;
      mapUrl?: string;
    } = {};
    for (const key of ["experience", "whyChooseUs", "address"] as const) {
      if (a[key] !== undefined)
        about[key] = localized(a[key], key === "address" ? 1000 : 4000);
    }
    if (a.mapUrl !== undefined) {
      if (!isSafeBrandHttpsUrlV1(a.mapUrl)) throw new Error("brand_invalid_content");
      about.mapUrl = a.mapUrl;
    }
    output.about = Object.freeze(about);
  }
  for (const group of ["appStores", "legal"] as const) {
    if (input[group] === undefined) continue;
    const source = record(input[group]);
    const links: {
      appStoreUrl?: string;
      googlePlayUrl?: string;
      privacyUrl?: string;
      termsUrl?: string;
    } = {};
    for (const key of group === "appStores"
      ? (["appStoreUrl", "googlePlayUrl"] as const)
      : (["privacyUrl", "termsUrl"] as const)) {
      if (source[key] === undefined) continue;
      if (!isSafeBrandHttpsUrlV1(source[key])) throw new Error("brand_invalid_content");
      links[key] = source[key];
    }
    output[group] = Object.freeze(links);
  }
  return Object.freeze(output);
}

export interface BookingRecoveryV1Request {
  readonly hostname: string;
  readonly application: "client";
  readonly email: string;
  readonly requestId: string;
}

/** This result intentionally carries no match, count, booking or credential. */
export interface BookingRecoveryV1Response {
  readonly contractVersion: 1;
  readonly outcome: "accepted";
}

export function parseBookingRecoveryV1Response(
  value: unknown,
): BookingRecoveryV1Response {
  const input = record(value);
  if (
    input.contractVersion !== 1 ||
    input.outcome !== "accepted" ||
    Object.keys(input).length !== 2
  )
    throw new Error("recovery_invalid_response");
  return Object.freeze({ contractVersion: 1, outcome: "accepted" });
}
