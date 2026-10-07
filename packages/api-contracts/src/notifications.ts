/**
 * Parsers and request builders for the notification settings, staff
 * preference, test-send, notification-brand and WhatsApp RPCs
 * (migrations 20261007100000 and 20261007101000). Dependency-free: every
 * response is checked field by field and anything unexpected throws.
 */

export const notificationTemplateKeysV1 = [
  "booking.confirmed",
  "management.otp_requested",
  "booking.requested",
  "booking.rejected",
  "booking.request_expired",
  "booking.proposal_created",
  "booking.proposal_declined",
  "booking.rescheduled",
  "booking.cancelled",
  "booking.reminder",
  "payment.refunded",
  "payment.refund_failed",
  "auth.sign_in_link",
  "auth.password_reset",
  "auth.email_change",
  "staff.request_pending",
  "staff.booking_cancelled",
  "staff.payment_exception",
  "staff.delivery_failed",
  "staff.daily_digest",
] as const;
export type NotificationTemplateKeyV1 = (typeof notificationTemplateKeysV1)[number];

export const staffPreferenceKeysV1 = [
  "staff.request_pending",
  "staff.booking_cancelled",
  "staff.payment_exception",
  "staff.delivery_failed",
  "staff.daily_digest",
] as const;
export type StaffPreferenceKeyV1 = (typeof staffPreferenceKeysV1)[number];

/** Reminder lead times: 1 to 4 distinct values, 15 minutes to 7 days. */
export const reminderOffsetBoundsV1 = { min: 15, max: 10080, maxCount: 4 } as const;

export type NotificationLocaleV1 = "en" | "ar";

export interface NotificationSettingItemV1 {
  readonly templateKey: NotificationTemplateKeyV1;
  readonly audience: "customer" | "staff";
  readonly emailEnabled: boolean;
  readonly whatsappEnabled: boolean;
  readonly whatsappCapable: boolean;
  readonly editable: boolean;
}
export interface NotificationSettingsV1 {
  readonly tenantId: string;
  /** 0 until the first save; send it back as `expectedRevision`. */
  readonly revision: number;
  readonly reminderOffsetsMinutes: readonly number[];
  readonly whatsappEntitled: boolean;
  readonly whatsappConfigured: boolean;
  readonly whatsappEnabled: boolean;
  readonly whatsappAvailable: boolean;
  readonly items: readonly NotificationSettingItemV1[];
}
export interface NotificationMutationV1 {
  readonly revision: number;
  readonly replayed: boolean;
}
export interface MyNotificationPreferencesV1 {
  readonly tenantId: string;
  readonly membershipId: string;
  readonly revision: number;
  /** `HH:MM`, wall clock in `digestTimeZone`. */
  readonly digestLocalTime: string;
  readonly digestTimeZone: string;
  readonly items: readonly {
    readonly templateKey: StaffPreferenceKeyV1;
    readonly enabled: boolean;
    readonly tenantEnabled: boolean;
  }[];
}
export interface StaffNotificationPreferencesV1 {
  readonly tenantId: string;
  readonly members: readonly {
    readonly membershipId: string;
    readonly name: string;
    readonly digestLocalTime: string;
    readonly items: readonly {
      readonly templateKey: StaffPreferenceKeyV1;
      readonly enabled: boolean;
    }[];
  }[];
}
export interface TestNotificationV1 {
  readonly messageId: string;
  readonly status: "queued";
  readonly replayed: boolean;
}
export interface NotificationBrandV2 {
  readonly nameEn: string;
  readonly nameAr: string;
  readonly logoUrl: string | null;
  readonly iconUrl: string | null;
  readonly primaryColor: string | null;
  readonly onPrimaryColor: string | null;
  readonly clientOrigin: string | null;
  readonly dashboardOrigin: string | null;
  readonly defaultLocale: NotificationLocaleV1;
  readonly supportEmail: string | null;
}
export interface WhatsAppTemplateRefV1 {
  readonly name: string;
  readonly language: string;
}
export interface WhatsAppConfigV1 {
  readonly tenantId: string;
  readonly revision: number;
  readonly entitled: boolean;
  readonly configured: boolean;
  readonly enabled: boolean;
  readonly available: boolean;
  readonly phoneNumberId: string | null;
  readonly businessAccountId: string | null;
  /** Whether a token reference is stored. The reference itself is never returned. */
  readonly accessTokenConfigured: boolean;
  readonly templateMap: Readonly<
    Partial<Record<NotificationTemplateKeyV1, WhatsAppTemplateRefV1>>
  >;
}
export interface WhatsAppOptInV1 {
  readonly phoneE164: string;
  readonly consentText: string;
  readonly consentVersion: string;
}

const uuidPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/iu;
const e164Pattern = /^\+[1-9][0-9]{7,14}$/u;
const timePattern = /^([01][0-9]|2[0-3]):[0-5][0-9]$/u;
const colorPattern = /^#[0-9A-Fa-f]{6}$/u;
const secretRefPattern =
  /^(vault:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|env:[A-Z][A-Za-z0-9_]{2,127})$/u;

function fail(message: string): never {
  throw new Error(`Invalid notification contract: ${message}`);
}
function object(value: unknown, what: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) fail(what);
  return value as Record<string, unknown>;
}
function versioned(value: unknown, what: string): Record<string, unknown> {
  const row = object(value, what);
  if (row.version !== 1) fail(`${what} version`);
  return row;
}
function text(value: unknown, what: string, max = 1024): string {
  if (typeof value !== "string" || value.length > max) fail(what);
  return value;
}
function optionalText(value: unknown, what: string, max = 2048): string | null {
  return value === null || value === undefined ? null : text(value, what, max);
}
function id(value: unknown, what: string): string {
  const result = text(value, what);
  if (!uuidPattern.test(result)) fail(what);
  return result;
}
function bool(value: unknown, what: string): boolean {
  if (typeof value !== "boolean") fail(what);
  return value;
}
function count(value: unknown, what: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0)
    fail(what);
  return value;
}
function items(value: unknown, what: string, max = 1000): unknown[] {
  if (!Array.isArray(value) || value.length > max) fail(what);
  return value;
}
function choice<T extends string>(
  value: unknown,
  choices: readonly T[],
  what: string,
): T {
  if (typeof value !== "string" || !choices.includes(value as T)) fail(what);
  return value as T;
}
function time(value: unknown, what: string): string {
  const result = text(value, what);
  if (!timePattern.test(result)) fail(what);
  return result;
}
function httpsUrl(value: unknown, what: string): string | null {
  const result = optionalText(value, what);
  if (result !== null && !result.startsWith("https://")) fail(what);
  return result;
}
function color(value: unknown, what: string): string | null {
  const result = optionalText(value, what);
  if (result !== null && !colorPattern.test(result)) fail(what);
  return result;
}

/** Validates reminder lead times exactly as the database does. */
export function isValidReminderOffsetsV1(offsets: readonly number[]): boolean {
  return (
    offsets.length >= 1 &&
    offsets.length <= reminderOffsetBoundsV1.maxCount &&
    new Set(offsets).size === offsets.length &&
    offsets.every(
      (offset) =>
        Number.isSafeInteger(offset) &&
        offset >= reminderOffsetBoundsV1.min &&
        offset <= reminderOffsetBoundsV1.max,
    )
  );
}

export function isE164PhoneNumber(value: string): boolean {
  return e164Pattern.test(value);
}

export function parseNotificationSettingsV1(value: unknown): NotificationSettingsV1 {
  const row = versioned(value, "settings");
  const offsets = items(row.reminder_offsets_minutes, "reminder offsets", 4).map(
    (offset) => count(offset, "reminder offset"),
  );
  if (!isValidReminderOffsetsV1(offsets)) fail("reminder offsets");
  return {
    tenantId: id(row.tenant_id, "tenant"),
    revision: count(row.revision, "revision"),
    reminderOffsetsMinutes: offsets,
    whatsappEntitled: bool(row.whatsapp_entitled, "whatsapp entitled"),
    whatsappConfigured: bool(row.whatsapp_configured, "whatsapp configured"),
    whatsappEnabled: bool(row.whatsapp_enabled, "whatsapp enabled"),
    whatsappAvailable: bool(row.whatsapp_available, "whatsapp available"),
    items: items(row.items, "settings items", 64).map((value) => {
      const item = object(value, "settings item");
      return {
        templateKey: choice(
          item.template_key,
          notificationTemplateKeysV1,
          "template key",
        ),
        audience: choice(item.audience, ["customer", "staff"] as const, "audience"),
        emailEnabled: bool(item.email_enabled, "email enabled"),
        whatsappEnabled: bool(item.whatsapp_enabled, "whatsapp enabled"),
        whatsappCapable: bool(item.whatsapp_capable, "whatsapp capable"),
        editable: bool(item.editable, "editable"),
      };
    }),
  };
}

/** `{version:1, revision, replayed}` from every save in this module. */
export function parseNotificationMutationV1(value: unknown): NotificationMutationV1 {
  const row = versioned(value, "mutation");
  const revision = count(row.revision, "revision");
  if (revision < 1) fail("revision");
  return { revision, replayed: bool(row.replayed, "replayed") };
}

export interface SaveNotificationSettingsV1Input {
  readonly tenantId: string;
  readonly settings: readonly {
    readonly templateKey: NotificationTemplateKeyV1;
    readonly emailEnabled?: boolean;
    readonly whatsappEnabled?: boolean;
  }[];
  readonly reminderOffsetsMinutes: readonly number[];
  readonly expectedRevision: number;
  readonly requestId: string;
}
export function buildSaveNotificationSettingsV1Request(
  input: SaveNotificationSettingsV1Input,
) {
  if (!isValidReminderOffsetsV1(input.reminderOffsetsMinutes)) fail("reminder offsets");
  return {
    p_tenant_id: id(input.tenantId, "tenant"),
    p_settings: input.settings.map((item) => ({
      template_key: choice(
        item.templateKey,
        notificationTemplateKeysV1,
        "template key",
      ),
      ...(item.emailEnabled === undefined ? {} : { email_enabled: item.emailEnabled }),
      ...(item.whatsappEnabled === undefined
        ? {}
        : { whatsapp_enabled: item.whatsappEnabled }),
    })),
    p_reminder_offsets: [...input.reminderOffsetsMinutes],
    p_expected_revision: count(input.expectedRevision, "expected revision"),
    p_request_id: id(input.requestId, "request"),
  };
}

export function parseMyNotificationPreferencesV1(
  value: unknown,
): MyNotificationPreferencesV1 {
  const row = versioned(value, "preferences");
  return {
    tenantId: id(row.tenant_id, "tenant"),
    membershipId: id(row.membership_id, "membership"),
    revision: count(row.revision, "revision"),
    digestLocalTime: time(row.digest_local_time, "digest time"),
    digestTimeZone: text(row.digest_time_zone, "digest time zone", 64),
    items: items(row.items, "preference items", 32).map((value) => {
      const item = object(value, "preference item");
      return {
        templateKey: choice(item.template_key, staffPreferenceKeysV1, "preference key"),
        enabled: bool(item.enabled, "enabled"),
        tenantEnabled: bool(item.tenant_enabled, "tenant enabled"),
      };
    }),
  };
}

export interface SaveMyNotificationPreferencesV1Input {
  readonly tenantId: string;
  readonly preferences: Readonly<Partial<Record<StaffPreferenceKeyV1, boolean>>>;
  readonly digestLocalTime?: string;
  readonly requestId: string;
}
export function buildSaveMyNotificationPreferencesV1Request(
  input: SaveMyNotificationPreferencesV1Input,
) {
  const preferences: Record<string, boolean | string> = {};
  for (const [key, enabled] of Object.entries(input.preferences)) {
    if (enabled === undefined) continue;
    preferences[choice(key, staffPreferenceKeysV1, "preference key")] = bool(
      enabled,
      "enabled",
    );
  }
  if (input.digestLocalTime !== undefined) {
    preferences.digest_local_time = time(input.digestLocalTime, "digest time");
  }
  return {
    p_tenant_id: id(input.tenantId, "tenant"),
    p_preferences: preferences,
    p_request_id: id(input.requestId, "request"),
  };
}

export function parseStaffNotificationPreferencesV1(
  value: unknown,
): StaffNotificationPreferencesV1 {
  const row = versioned(value, "team preferences");
  return {
    tenantId: id(row.tenant_id, "tenant"),
    members: items(row.members, "members", 10000).map((value) => {
      const member = object(value, "member");
      return {
        membershipId: id(member.membership_id, "membership"),
        name: text(member.name, "name"),
        digestLocalTime: time(member.digest_local_time, "digest time"),
        items: items(member.items, "member items", 32).map((value) => {
          const item = object(value, "member item");
          return {
            templateKey: choice(
              item.template_key,
              staffPreferenceKeysV1,
              "preference key",
            ),
            enabled: bool(item.enabled, "enabled"),
          };
        }),
      };
    }),
  };
}

export function buildEnqueueTestNotificationV1Request(input: {
  readonly tenantId: string;
  readonly templateKey: NotificationTemplateKeyV1;
  readonly locale: NotificationLocaleV1;
  readonly requestId: string;
}) {
  return {
    p_tenant_id: id(input.tenantId, "tenant"),
    p_template_key: choice(
      input.templateKey,
      notificationTemplateKeysV1,
      "template key",
    ),
    p_locale: choice(input.locale, ["en", "ar"] as const, "locale"),
    p_request_id: id(input.requestId, "request"),
  };
}

export function parseTestNotificationV1(value: unknown): TestNotificationV1 {
  const row = versioned(value, "test notification");
  return {
    messageId: id(row.message_id, "message"),
    status: choice(row.status, ["queued"] as const, "status"),
    replayed: bool(row.replayed, "replayed"),
  };
}

/** Accepts the row itself or PostgREST's one-row array. */
export function parseNotificationBrandV2(value: unknown): NotificationBrandV2 {
  const rows = Array.isArray(value) ? value : [value];
  if (rows.length !== 1) fail("brand rows");
  const row = object(rows[0], "brand");
  return {
    nameEn: text(row.name_en, "english name", 200),
    nameAr: text(row.name_ar, "arabic name", 200),
    logoUrl: httpsUrl(row.logo_url, "logo"),
    iconUrl: httpsUrl(row.icon_url, "icon"),
    primaryColor: color(row.primary_color, "primary color"),
    onPrimaryColor: color(row.on_primary_color, "on-primary color"),
    clientOrigin: httpsUrl(row.client_origin, "client origin"),
    dashboardOrigin: httpsUrl(row.dashboard_origin, "dashboard origin"),
    defaultLocale: choice(row.default_locale, ["en", "ar"] as const, "default locale"),
    supportEmail: optionalText(row.support_email, "support email", 320),
  };
}

function templateMap(value: unknown): WhatsAppConfigV1["templateMap"] {
  const map = object(value, "template map");
  const result: Partial<Record<NotificationTemplateKeyV1, WhatsAppTemplateRefV1>> = {};
  for (const [key, entry] of Object.entries(map)) {
    const ref = object(entry, "template ref");
    result[choice(key, notificationTemplateKeysV1, "template key")] = {
      name: text(ref.name, "template name", 512),
      language: text(ref.language, "template language", 16),
    };
  }
  return result;
}

export function parseWhatsAppConfigV1(value: unknown): WhatsAppConfigV1 {
  const row = versioned(value, "whatsapp config");
  // Defence in depth: a response that ever carried the reference is refused.
  if ("access_token_secret_ref" in row) fail("secret reference exposed");
  return {
    tenantId: id(row.tenant_id, "tenant"),
    revision: count(row.revision, "revision"),
    entitled: bool(row.entitled, "entitled"),
    configured: bool(row.configured, "configured"),
    enabled: bool(row.enabled, "enabled"),
    available: bool(row.available, "available"),
    phoneNumberId: optionalText(row.phone_number_id, "phone number id", 32),
    businessAccountId: optionalText(row.business_account_id, "business account id", 32),
    accessTokenConfigured: bool(row.access_token_configured, "token configured"),
    templateMap: templateMap(row.template_map),
  };
}

export interface SaveWhatsAppConfigV1Input {
  readonly tenantId: string;
  readonly enabled: boolean;
  readonly phoneNumberId: string | null;
  readonly businessAccountId: string | null;
  /** Omit to keep the stored reference; `null` removes it. Never a token. */
  readonly accessTokenSecretRef?: string | null;
  readonly templateMap: WhatsAppConfigV1["templateMap"];
  readonly expectedRevision: number;
  readonly requestId: string;
}
export function buildSaveWhatsAppConfigV1Request(input: SaveWhatsAppConfigV1Input) {
  const ref = input.accessTokenSecretRef;
  if (typeof ref === "string" && !secretRefPattern.test(ref)) fail("secret reference");
  for (const digits of [input.phoneNumberId, input.businessAccountId]) {
    if (digits !== null && !/^[0-9]{5,32}$/u.test(digits)) fail("whatsapp id");
  }
  return {
    p_tenant_id: id(input.tenantId, "tenant"),
    p_config: {
      enabled: input.enabled,
      phone_number_id: input.phoneNumberId,
      business_account_id: input.businessAccountId,
      ...(ref === undefined ? {} : { access_token_secret_ref: ref }),
      template_map: templateMap(input.templateMap),
    },
    p_expected_revision: count(input.expectedRevision, "expected revision"),
    p_request_id: id(input.requestId, "request"),
  };
}

export function parsePublicWhatsAppAvailabilityV1(value: unknown): {
  readonly whatsappAvailable: boolean;
} {
  const row = versioned(value, "whatsapp availability");
  return { whatsappAvailable: bool(row.whatsapp_available, "whatsapp available") };
}

/**
 * The `whatsappOptIn` object carried inside `p_contact` of
 * `confirm_booking_v1` / `begin_checkout_v1`. Validated as the database does.
 */
export function buildWhatsAppOptInV1(input: WhatsAppOptInV1): WhatsAppOptInV1 {
  const consentText = input.consentText.trim();
  if (!isE164PhoneNumber(input.phoneE164)) fail("phone number");
  if (consentText.length < 1 || consentText.length > 2000) fail("consent text");
  if (!/^[A-Za-z0-9._-]{1,40}$/u.test(input.consentVersion)) fail("consent version");
  return {
    phoneE164: input.phoneE164,
    consentText,
    consentVersion: input.consentVersion,
  };
}
