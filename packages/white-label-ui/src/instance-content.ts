/**
 * Instance text: every tenant-facing word lives in the instance folder's
 * content/en.json and content/ar.json, never in application source. Keys are
 * flat dotted strings ("home.hero.title"); values may contain {placeholders}.
 */
export type InstanceLocale = "en" | "ar";
export type InstanceMessages = Readonly<Record<string, string>>;
export type InstanceContent = Readonly<Record<InstanceLocale, InstanceMessages>>;
export type InstanceText = (
  key: string,
  values?: Readonly<Record<string, string | number>>,
) => string;

function isMessages(value: unknown): value is Record<string, string> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value).every(
      (entry) => typeof entry === "string" && entry.trim() !== "",
    )
  );
}

export function parseInstanceContent(value: unknown): InstanceContent {
  if (typeof value !== "object" || value === null) {
    throw new Error("Instance content must be an object with en and ar messages");
  }
  const { en, ar } = value as Record<string, unknown>;
  if (!isMessages(en) || !isMessages(ar)) {
    throw new Error("Instance content en and ar must map keys to non-empty strings");
  }
  const enKeys = Object.keys(en).sort();
  const arKeys = Object.keys(ar).sort();
  if (enKeys.join("\n") !== arKeys.join("\n")) {
    throw new Error("Instance content en and ar must have identical keys");
  }
  return Object.freeze({ en: Object.freeze({ ...en }), ar: Object.freeze({ ...ar }) });
}

/** Returns a translator for one locale. A missing key fails loudly, never silently in English. */
export function createInstanceText(
  content: InstanceContent,
  locale: InstanceLocale,
): InstanceText {
  const messages = content[locale];
  return (key, values) => {
    const message = messages[key];
    if (message === undefined) {
      throw new Error(`Instance content is missing "${key}" for ${locale}`);
    }
    if (values === undefined) return message;
    return message.replace(/\{(\w+)\}/gu, (match, name: string) =>
      Object.hasOwn(values, name) ? String(values[name]) : match,
    );
  };
}
