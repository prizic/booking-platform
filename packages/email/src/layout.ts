import type { ContractLocale } from "@wlbp/api-contracts";

import {
  resolveButtonColors,
  safeEmailAddress,
  safeImageUrl,
  safeLinkUrl,
  type EmailBrand,
} from "./brand.js";
import type { DailyDigest } from "./digest.js";

/**
 * The one email layout. Built for the mail clients people actually use:
 * nested presentation tables, inline styles only, a 600px column, no external
 * CSS, script or web font, and an Outlook (MSO) fixed-width wrapper. Every
 * value that reaches markup passes through `escapeHtml`, and every URL through
 * `safeLinkUrl`/`safeImageUrl` first.
 */
export interface CardRow {
  readonly label: string;
  readonly value: string;
  readonly secondary?: string;
  /** References, codes and zone names read left to right in any locale. */
  readonly ltr?: boolean;
}

export interface EmailAction {
  readonly kind: "primary" | "secondary";
  readonly label: string;
  readonly url: string;
}

export interface AgendaLabels {
  readonly customer: string;
  readonly empty: string;
  /** Already localized, including the count, e.g. "And 3 more in the Dashboard". */
  readonly more: string;
  readonly service: string;
  readonly staff: string;
  readonly time: string;
  readonly timeZoneNote: string;
}

export interface EmailDocument {
  readonly actions: readonly EmailAction[];
  readonly agenda?: { readonly digest: DailyDigest; readonly labels: AgendaLabels };
  readonly brand?: EmailBrand;
  readonly brandName: string;
  readonly card: readonly CardRow[];
  readonly cardTitle?: string;
  readonly fallbackLinkLabel: string;
  readonly footer: {
    readonly preferences?: { readonly label: string; readonly url: string };
    readonly support?: { readonly label: string; readonly email: string };
    readonly why: string;
  };
  readonly heading: string;
  readonly intro: readonly string[];
  readonly locale: ContractLocale;
  readonly notes: readonly string[];
  readonly preheader: string;
  readonly subject: string;
  readonly testBanner?: string;
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

const fontStacks: Record<ContractLocale, string> = {
  // Noto first where installed (Android, many desktops), Tahoma as the
  // universally present Arabic-capable fallback (Windows/Outlook), then system.
  ar: "'Noto Sans Arabic','Noto Naskh Arabic',Tahoma,'Segoe UI',Arial,sans-serif",
  en: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif",
};

const ink = "#18181b";
const muted = "#52525b";
const hairline = "#e4e4e7";
const canvas = "#f4f4f5";
const panel = "#fafafa";

function ltrSpan(value: string): string {
  return `<span dir="ltr" style="unicode-bidi:isolate">${escapeHtml(value)}</span>`;
}

function paragraph(text: string, font: string, align: string, color = ink): string {
  return (
    `<p style="margin:0 0 12px 0;font-family:${font};font-size:16px;line-height:24px;` +
    `color:${color};text-align:${align}">${escapeHtml(text)}</p>`
  );
}

function button(
  action: EmailAction,
  font: string,
  brand: EmailBrand | undefined,
): string {
  const href = safeLinkUrl(action.url);
  if (href === null) return "";
  const colors = resolveButtonColors(brand);
  const primary = action.kind === "primary";
  const background = primary ? colors.background : "#ffffff";
  const text = primary ? colors.text : ink;
  const border = primary ? colors.background : "#d4d4d8";
  return (
    '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 10px 0;border-collapse:separate">' +
    `<tr><td align="center" bgcolor="${background}" style="border-radius:6px;background-color:${background};border:1px solid ${border}">` +
    `<a href="${escapeHtml(href)}" target="_blank" rel="noopener" style="display:inline-block;padding:12px 22px;` +
    `font-family:${font};font-size:15px;line-height:20px;font-weight:600;color:${text};text-decoration:none;border-radius:6px">` +
    `${escapeHtml(action.label)}</a></td></tr></table>`
  );
}

function cardHtml(
  rows: readonly CardRow[],
  title: string | undefined,
  font: string,
  align: string,
): string {
  if (rows.length === 0) return "";
  const body = rows
    .map((row, index) => {
      const border = index === 0 ? "" : `border-top:1px solid ${hairline};`;
      const value = row.ltr === true ? ltrSpan(row.value) : escapeHtml(row.value);
      const secondary =
        row.secondary === undefined
          ? ""
          : `<br><span style="font-size:14px;line-height:20px;color:${muted}">${
              row.ltr === true || /^[\w/+-]+$/u.test(row.secondary)
                ? ltrSpan(row.secondary)
                : escapeHtml(row.secondary)
            }</span>`;
      return (
        `<tr><td style="${border}padding:12px 16px;font-family:${font};text-align:${align}">` +
        `<span style="display:block;font-size:13px;line-height:18px;color:${muted}">${escapeHtml(row.label)}</span>` +
        `<span style="display:block;font-size:16px;line-height:24px;color:${ink};font-weight:600">${value}${secondary}</span>` +
        "</td></tr>"
      );
    })
    .join("");
  const caption =
    title === undefined
      ? ""
      : `<tr><td style="padding:12px 16px 0 16px;font-family:${font};font-size:13px;line-height:18px;font-weight:700;color:${muted};text-align:${align}">${escapeHtml(title)}</td></tr>`;
  return (
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 20px 0;border:1px solid ${hairline};border-radius:8px;background-color:${panel};border-collapse:separate">` +
    `${caption}${body}</table>`
  );
}

function agendaHtml(
  agenda: NonNullable<EmailDocument["agenda"]>,
  font: string,
  align: string,
): string {
  const { digest, labels } = agenda;
  if (digest.count === 0) return paragraph(labels.empty, font, align, muted);
  const cell = (content: string, header = false) =>
    `<${header ? 'th scope="col"' : "td"} style="padding:10px 12px;border-top:1px solid ${hairline};font-family:${font};` +
    `font-size:${header ? "13px" : "15px"};line-height:20px;color:${header ? muted : ink};` +
    `font-weight:${header ? "600" : "400"};text-align:${align};vertical-align:top">${content}</${header ? "th" : "td"}>`;
  const sections = digest.groups
    .map((group) => {
      const heading =
        group.locationName === undefined || digest.groups.length < 2
          ? ""
          : `<p style="margin:16px 0 6px 0;font-family:${font};font-size:15px;line-height:22px;font-weight:700;color:${ink};text-align:${align}">${escapeHtml(group.locationName)}</p>`;
      const head =
        "<tr>" +
        cell(escapeHtml(labels.time), true) +
        cell(escapeHtml(labels.service), true) +
        cell(escapeHtml(labels.customer), true) +
        (digest.showStaff ? cell(escapeHtml(labels.staff), true) : "") +
        "</tr>";
      const rows = group.entries
        .map(
          (entry) =>
            "<tr>" +
            cell(
              `<span style="font-weight:600;white-space:nowrap">${escapeHtml(entry.time)}</span>`,
            ) +
            cell(escapeHtml(entry.serviceName)) +
            cell(escapeHtml(entry.customerFirstName ?? "—")) +
            (digest.showStaff ? cell(escapeHtml(entry.staffName ?? "—")) : "") +
            "</tr>",
        )
        .join("");
      return (
        heading +
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ${hairline};border-radius:8px;border-collapse:separate;background-color:${panel};margin:0 0 12px 0">` +
        `${head}${rows}</table>`
      );
    })
    .join("");
  const more = digest.hiddenCount > 0 ? paragraph(labels.more, font, align, muted) : "";
  const zone =
    `<p style="margin:0 0 16px 0;font-family:${font};font-size:13px;line-height:18px;color:${muted};text-align:${align}">` +
    `${escapeHtml(labels.timeZoneNote)} ${ltrSpan(digest.timeZone)}</p>`;
  return sections + more + zone;
}

export function renderEmailHtml(document: EmailDocument): string {
  const { locale } = document;
  const rtl = locale === "ar";
  const direction = rtl ? "rtl" : "ltr";
  const align = rtl ? "right" : "left";
  const font = fontStacks[locale];
  const logo = safeImageUrl(document.brand?.logoUrl);
  const primary = resolveButtonColors(document.brand).background;

  const banner =
    document.testBanner === undefined
      ? ""
      : `<tr><td style="padding:10px 24px;background-color:#fef3c7;border-bottom:1px solid #f59e0b;font-family:${font};font-size:14px;line-height:20px;font-weight:700;color:#78350f;text-align:${align}" role="note">${escapeHtml(document.testBanner)}</td></tr>`;

  const header =
    `<tr><td style="padding:20px 24px;border-top:4px solid ${primary};border-bottom:1px solid ${hairline};text-align:${align}">` +
    (logo === null
      ? ""
      : `<img src="${escapeHtml(logo)}" alt="${escapeHtml(document.brandName)}" height="40" style="display:block;height:40px;width:auto;max-width:200px;border:0;outline:none;text-decoration:none;margin:0 0 8px 0;${rtl ? "margin-left:auto" : "margin-right:auto"}">`) +
    `<span style="display:block;font-family:${font};font-size:${logo === null ? "20px" : "15px"};line-height:26px;font-weight:700;color:${ink}">${escapeHtml(document.brandName)}</span>` +
    "</td></tr>";

  const actions = document.actions
    .map((action) => button(action, font, document.brand))
    .join("");
  const primaryAction = document.actions.find(
    (action) => action.kind === "primary" && safeLinkUrl(action.url) !== null,
  );
  const fallback =
    primaryAction === undefined
      ? ""
      : `<p style="margin:4px 0 16px 0;font-family:${font};font-size:13px;line-height:19px;color:${muted};text-align:${align}">` +
        `${escapeHtml(document.fallbackLinkLabel)}<br>` +
        `<a href="${escapeHtml(safeLinkUrl(primaryAction.url) ?? "")}" style="color:${muted};text-decoration:underline;word-break:break-all" dir="ltr">${escapeHtml(safeLinkUrl(primaryAction.url) ?? "")}</a></p>`;

  const content =
    `<tr><td style="padding:28px 24px 8px 24px;text-align:${align}">` +
    `<h1 style="margin:0 0 16px 0;font-family:${font};font-size:24px;line-height:32px;font-weight:700;color:${ink};text-align:${align}">${escapeHtml(document.heading)}</h1>` +
    document.intro.map((line) => paragraph(line, font, align)).join("") +
    cardHtml(document.card, document.cardTitle, font, align) +
    (document.agenda === undefined ? "" : agendaHtml(document.agenda, font, align)) +
    actions +
    fallback +
    document.notes.map((line) => paragraph(line, font, align, muted)).join("") +
    "</td></tr>";

  const { footer } = document;
  const preferences =
    footer.preferences === undefined || safeLinkUrl(footer.preferences.url) === null
      ? ""
      : `<br><a href="${escapeHtml(safeLinkUrl(footer.preferences.url) ?? "")}" style="color:${muted};text-decoration:underline">${escapeHtml(footer.preferences.label)}</a>`;
  const supportEmail = safeEmailAddress(footer.support?.email);
  const support =
    footer.support === undefined || supportEmail === null
      ? ""
      : `<br>${escapeHtml(footer.support.label)} <a href="mailto:${escapeHtml(supportEmail)}" style="color:${muted};text-decoration:underline" dir="ltr">${escapeHtml(supportEmail)}</a>`;
  const footerRow =
    `<tr><td style="padding:20px 24px 28px 24px;border-top:1px solid ${hairline};font-family:${font};font-size:13px;line-height:20px;color:${muted};text-align:${align}">` +
    `<strong style="color:${ink}">${escapeHtml(document.brandName)}</strong><br>` +
    `${escapeHtml(footer.why)}${preferences}${support}</td></tr>`;

  // The preheader is the inbox preview line; the padding after it stops a
  // client from pulling body text into the preview.
  const preheader =
    `<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;color:${canvas}">` +
    `${escapeHtml(document.preheader)}${"&#8204;&nbsp;".repeat(40)}</div>`;

  return [
    "<!doctype html>",
    `<html lang="${locale}" dir="${direction}" xmlns="http://www.w3.org/1999/xhtml">`,
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    '<meta http-equiv="X-UA-Compatible" content="IE=edge">',
    '<meta name="x-apple-disable-message-reformatting">',
    '<meta name="color-scheme" content="light">',
    '<meta name="supported-color-schemes" content="light">',
    `<title>${escapeHtml(document.subject)}</title>`,
    "</head>",
    `<body dir="${direction}" style="margin:0;padding:0;width:100%;background-color:${canvas};-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%">`,
    preheader,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" dir="${direction}" style="background-color:${canvas};border-collapse:collapse">`,
    '<tr><td align="center" style="padding:24px 12px">',
    '<!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" align="center"><tr><td><![endif]-->',
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" dir="${direction}" style="max-width:600px;width:100%;background-color:#ffffff;border:1px solid ${hairline};border-radius:8px;border-collapse:separate">`,
    banner,
    header,
    content,
    footerRow,
    "</table>",
    "<!--[if mso]></td></tr></table><![endif]-->",
    "</td></tr></table>",
    "</body></html>",
  ].join("");
}

/**
 * The plain-text twin: the same facts in the same order, so a text-only
 * client still receives a complete message, not a stripped-tag afterthought.
 */
export function renderEmailText(document: EmailDocument): string {
  const lines: string[] = [];
  if (document.testBanner !== undefined)
    lines.push(`*** ${document.testBanner} ***`, "");
  lines.push(document.brandName, "", document.heading, "");
  if (document.intro.length > 0) lines.push(...document.intro, "");
  if (document.card.length > 0) {
    if (document.cardTitle !== undefined) lines.push(document.cardTitle);
    for (const row of document.card) {
      lines.push(`${row.label}: ${row.value}`);
      if (row.secondary !== undefined) lines.push(`  ${row.secondary}`);
    }
    lines.push("");
  }
  if (document.agenda !== undefined) {
    const { digest, labels } = document.agenda;
    if (digest.count === 0) lines.push(labels.empty, "");
    for (const group of digest.groups) {
      if (group.locationName !== undefined && digest.groups.length > 1) {
        lines.push(group.locationName);
      }
      for (const entry of group.entries) {
        const parts = [entry.time, entry.serviceName];
        if (entry.customerFirstName !== undefined) parts.push(entry.customerFirstName);
        if (digest.showStaff && entry.staffName !== undefined)
          parts.push(entry.staffName);
        lines.push(`- ${parts.join(" · ")}`);
      }
      lines.push("");
    }
    if (digest.hiddenCount > 0) {
      lines.push(labels.more, "");
    }
    if (digest.count > 0) lines.push(`${labels.timeZoneNote} ${digest.timeZone}`, "");
  }
  for (const action of document.actions) {
    const url = safeLinkUrl(action.url);
    if (url !== null) lines.push(`${action.label}: ${url}`);
  }
  if (document.actions.length > 0) lines.push("");
  if (document.notes.length > 0) lines.push(...document.notes, "");
  lines.push("--", document.brandName, document.footer.why);
  const preferencesUrl = safeLinkUrl(document.footer.preferences?.url);
  if (document.footer.preferences !== undefined && preferencesUrl !== null) {
    lines.push(`${document.footer.preferences.label}: ${preferencesUrl}`);
  }
  const supportEmail = safeEmailAddress(document.footer.support?.email);
  if (document.footer.support !== undefined && supportEmail !== null) {
    lines.push(`${document.footer.support.label} ${supportEmail}`);
  }
  return `${lines.join("\n")}\n`;
}
