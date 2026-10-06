import { isLocale, type Locale } from "@wlbp/i18n";

export function text(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value.trim() : "";
}

export function optional(form: FormData, name: string): string | undefined {
  return text(form, name) || undefined;
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

export function asUuid(value: string | undefined): string | undefined {
  const trimmed = value?.trim() ?? "";
  return uuidPattern.test(trimmed) ? trimmed.toLowerCase() : undefined;
}

export function uuid(form: FormData, name: string): string | undefined {
  return asUuid(text(form, name));
}

export function integer(form: FormData, name: string): number | undefined {
  const value = Number.parseInt(text(form, name), 10);
  return Number.isFinite(value) ? value : undefined;
}

/** `<input type="datetime-local">` values are entered and shown in UTC. */
export function instant(form: FormData, name: string): string | undefined {
  const value = text(form, name);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/u.test(value)) return undefined;
  const date = new Date(`${value}:00Z`);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

export function lines(form: FormData, name: string): string[] {
  return text(form, name)
    .split(/[\n,]/u)
    .map((line) => line.trim())
    .filter(Boolean);
}

export function localeOf(form: FormData): Locale {
  const value = text(form, "locale");
  return isLocale(value) ? value : "en";
}
