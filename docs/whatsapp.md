# WhatsApp notifications — operator guide

Purpose: how a platform operator and a tenant set up, test and troubleshoot the optional WhatsApp notification channel.

Authoritative source: [ADR-0018: WhatsApp notification channel](adr/0018-whatsapp-notification-channel.md). Where this guide and the ADR disagree, the ADR wins.

> **Legal.** Per-market consent, sender registration and template approval requires independent legal review. Nothing in this guide is legal advice, and nothing in the product claims compliance with any messaging, privacy or consumer law.

## What the channel does — and does not

- It is **off by default** and **optional**. Email for the same event is always sent; WhatsApp is an extra copy.
- A message goes only when **all three** hold: the tenant's plan grants the `whatsapp_notifications` entitlement; the tenant has enabled and configured the channel; and the customer ticked the separate, unticked WhatsApp opt-in for **that booking** and entered an E.164 number. The consent text, its version and locale are snapshotted on the booking.
- Only **Meta-approved templates** are sent. There is no free-form message.
- Only these customer message types can use WhatsApp: `booking.confirmed`, `booking.requested`, `booking.rejected`, `booking.request_expired`, `booking.proposal_created`, `booking.proposal_declined`, `booking.rescheduled`, `booking.cancelled`, `booking.reminder`. Staff alerts, payment messages, management one-time codes and sign-in mail stay on email.
- No management or proposal link is ever put in a WhatsApp message. Templates point the customer to the email, which carries the link.
- Inbound customer replies are ignored and not stored. Tell customers in the template footer where to get help.

## Roles

| Who | Does |
| --- | --- |
| Platform operator | Owns the platform Meta app, sets `WHATSAPP_APP_SECRET` and `WHATSAPP_WEBHOOK_VERIFY_TOKEN`, registers the webhook, stores each tenant's access token as an Edge Function secret, grants the entitlement |
| Tenant owner/admin | Owns the WhatsApp Business account and phone number, creates and gets templates approved, enters ids and template names in Dashboard → Integrations → WhatsApp (needs `integration.manage` and a recent MFA step-up) |

## 1. Meta Business setup (tenant, with the operator)

1. In Meta Business Suite, verify the tenant's business. Some markets and volumes require it before templates can be sent.
2. In the platform's Meta developer app (product **WhatsApp**), add the tenant's **WhatsApp Business Account (WABA)** and register its business phone number. A number already used in the WhatsApp consumer app must be migrated first.
3. Set the number's **display name** and wait for its approval (error `131037` until approved).
4. Add a payment method to the WABA (error `131042` otherwise).
5. Record two numeric ids from **WhatsApp → API Setup**:
   - **Phone number ID** (e.g. `106540352242922`) — the sending number.
   - **WhatsApp Business Account ID** (e.g. `102290129340398`).

## 2. A permanent access token, stored as a reference

Temporary tokens from API Setup expire in 24 hours; do not use them beyond a first test.

1. In Business Settings → **System users**, create a system user for the tenant's WABA, assign the WhatsApp app and the WABA with *Full control*, and generate a token with `whatsapp_business_messaging` and `whatsapp_business_management` permissions and **no expiry**.
2. Compute the tenant's secret name: `WHATSAPP_TOKEN_` followed by the tenant id with the hyphens removed, in upper case. Tenant `0a3f2b64-0000-4000-8000-000000000001` → `WHATSAPP_TOKEN_0A3F2B64000040008000000000000001`.
3. Store the token as an Edge Function secret (platform operator, never in Git, a ticket or a chat):

   ```sh
   supabase secrets set --project-ref <project-ref> WHATSAPP_TOKEN_<TENANT_HEX>=<paste-token-here>
   ```

4. In the Dashboard WhatsApp card, set the token reference to `env:WHATSAPP_TOKEN_<TENANT_HEX>`. The Dashboard only ever shows "configured: yes/no"; it never sees the token.
5. **Rotation:** store the new token as `WHATSAPP_TOKEN_<TENANT_HEX>_R2` (suffix: up to 16 upper-case letters or digits), switch the reference to `env:WHATSAPP_TOKEN_<TENANT_HEX>_R2`, confirm a test send, then `supabase secrets unset` the old name.

The worker refuses any reference that does not carry the tenant's own id (`token_reference_invalid`), so a tenant cannot point at another tenant's token or at a platform key. `vault:` references are accepted by the schema but **not yet resolved** (`token_reference_unsupported`); use `env:`.

## 3. Webhook (platform operator, once)

1. Generate a random verify token (32+ characters) and set the platform secrets:

   ```sh
   supabase secrets set --project-ref <project-ref> WHATSAPP_WEBHOOK_VERIFY_TOKEN=<random> WHATSAPP_APP_SECRET=<meta-app-secret>
   ```

   `WHATSAPP_APP_SECRET` is the Meta app's **App secret** (App settings → Basic).
2. In the Meta app → WhatsApp → **Configuration**, set:
   - **Callback URL:** `https://<project-ref>.supabase.co/functions/v1/whatsapp-webhook`
   - **Verify token:** the value above.
   Meta calls `GET ?hub.mode=subscribe&hub.verify_token=…&hub.challenge=…`; the function echoes the challenge only for the right token.
3. Subscribe the webhook field **`messages`**. Status notifications (`sent`, `delivered`, `read`, `failed`) arrive on it.
4. Every POST is verified with `X-Hub-Signature-256` (HMAC-SHA256 of the raw body with the app secret). An unsigned or wrongly signed delivery gets `400` and is not recorded.

The worker runs every minute from `supabase/cron/schedule.sql` (`wlbp-whatsapp-worker`).

## 4. Templates

Create templates in WhatsApp Manager → **Message templates**, category **Utility**, one per message type and language. Use the same name for both languages (e.g. `booking_confirmed_v1` in `ar` and `en`) and map it in the Dashboard as `{ "name": "booking_confirmed_v1", "language": "ar" }` — the language code must match the approved translation exactly (`en` vs `en_US`).

Rules the platform relies on:

- **Body only**, text variables `{{1}}`, `{{2}}`, … in exactly the order below. No header media, no buttons with variables.
- A body may not start or end with a variable, and variables may not be too dense relative to the text (Meta errors `2388299`, `2388293`).
- Variable values are flattened by the platform: newlines and tabs become spaces, runs of more than four spaces are shortened, and each value is capped at 1,024 characters.
- `{{1}}` is always the tenant's published brand name in the message language.

| Message type | Variables, in order |
| --- | --- |
| `booking.confirmed` | 1 brand, 2 service, 3 date and time (with time zone), 4 location, 5 reference |
| `booking.reminder` | 1 brand, 2 service, 3 date and time, 4 location, 5 reference |
| `booking.requested` | 1 brand, 2 service, 3 requested date and time, 4 reference |
| `booking.rescheduled` | 1 brand, 2 service, 3 new date and time, 4 reference |
| `booking.proposal_created` | 1 brand, 2 service, 3 proposed date and time, 4 reference |
| `booking.cancelled` | 1 brand, 2 service, 3 reference |
| `booking.rejected` | 1 brand, 2 service, 3 reference |
| `booking.request_expired` | 1 brand, 2 service, 3 reference |
| `booking.proposal_declined` | 1 brand, 2 service, 3 reference |

Example bodies (adapt the wording; keep the variable order):

| Type | Arabic (`ar`) | English (`en`) |
| --- | --- | --- |
| `booking.confirmed` | تم تأكيد حجزك لدى {{1}}: {{2}} يوم {{3}} في {{4}}. رقم المرجع {{5}}. لإدارة الحجز استخدم الرابط في بريدك الإلكتروني. | Your booking with {{1}} is confirmed: {{2}} on {{3}} at {{4}}. Reference {{5}}. Use the link in your email to manage it. |
| `booking.reminder` | تذكير من {{1}}: موعدك {{2}} يوم {{3}} في {{4}}. رقم المرجع {{5}}. للتعديل أو الإلغاء استخدم الرابط في بريدك الإلكتروني. | Reminder from {{1}}: {{2}} on {{3}} at {{4}}. Reference {{5}}. To change or cancel, use the link in your email. |
| `booking.requested` | استلمت {{1}} طلبك: {{2}} يوم {{3}}. رقم المرجع {{4}}. سنبلغك بالقرار عبر البريد الإلكتروني. | {{1}} received your request: {{2}} on {{3}}. Reference {{4}}. We will email you the decision. |
| `booking.rescheduled` | نقلت {{1}} حجزك {{2}} إلى {{3}}. رقم المرجع {{4}}. التفاصيل في بريدك الإلكتروني. | {{1}} moved your booking for {{2}} to {{3}}. Reference {{4}}. Details are in your email. |
| `booking.proposal_created` | اقترحت {{1}} موعداً جديداً لـ {{2}}: {{3}}. رقم المرجع {{4}}. للقبول أو الرفض استخدم الرابط في بريدك الإلكتروني. | {{1}} suggested a new time for {{2}}: {{3}}. Reference {{4}}. Accept or decline with the link in your email. |
| `booking.cancelled` | ألغت {{1}} حجزك {{2}}. رقم المرجع {{3}}. التفاصيل وأي استرداد في بريدك الإلكتروني. | {{1}} cancelled your booking for {{2}}. Reference {{3}}. Details and any refund are in your email. |
| `booking.rejected` | تعذر على {{1}} قبول طلبك {{2}}. رقم المرجع {{3}}. التفاصيل في بريدك الإلكتروني. | {{1}} could not accept your request for {{2}}. Reference {{3}}. Details are in your email. |
| `booking.request_expired` | انتهت مهلة طلبك لدى {{1}} لـ {{2}}. رقم المرجع {{3}}. يمكنك طلب موعد آخر. | Your request with {{1}} for {{2}} has closed. Reference {{3}}. You can request another time. |
| `booking.proposal_declined` | أبلغنا {{1}} برفضك الموعد المقترح لـ {{2}}. رقم المرجع {{3}}. طلبك الأصلي ما زال قائماً. | We told {{1}} you declined the suggested time for {{2}}. Reference {{3}}. Your original request is still open. |

Submit both languages, wait for **Approved**, then enter the names in the Dashboard. Do not edit an approved template in place for a live tenant; create `_v2`, get it approved, then switch the mapping.

## 5. Testing

1. Unit and function tests run without Meta: `pnpm --filter @wlbp/integrations test:unit` and `pnpm check:edge`.
2. Sandbox: Meta's API Setup page gives a test number and lets you add up to five recipient numbers. A recipient not on that list fails with `131030`.
3. With the entitlement on and the channel configured, make a booking on the Client with the WhatsApp opt-in ticked and your own number. You should receive the email **and** the WhatsApp message within a minute; delivery status updates follow through the webhook.
4. Check the message row's attempts and provider events in Platform Admin; never copy a customer number or token into a ticket.

## 6. Troubleshooting

The worker records a stable error code on every attempt. Provider text is never stored because it can quote a phone number.

| Code | Meaning | Retried? | Fix |
| --- | --- | --- | --- |
| `token_unresolved` | The `env:` secret is not set | Yes, until retries run out | Set the Edge Function secret (section 2) |
| `token_reference_invalid` | Reference missing, not `env:`, or not this tenant's name | No | Correct the reference |
| `token_reference_unsupported` | A `vault:` reference | No | Use an `env:` reference |
| `template_unmapped` / `phone_number_unconfigured` | Dashboard configuration incomplete for this type | No | Complete the WhatsApp card |
| `unsupported_template` | Message type is not WhatsApp-capable | No | Expected for staff/payment types |
| `invalid_recipient` / `missing_parameter` | Number not E.164, or a required value was empty | No | Check the booking data |
| `brand_unresolved` | No published brand name | Yes | Publish the brand |
| `network_error`, `http_5xx`, `meta_130429`, `meta_131056`, `meta_4`, `meta_80007`, `meta_131000`, `meta_131016` | Meta busy, rate-limited or down | Yes | None; watch volume |
| `meta_0`, `meta_190`, `meta_10`, `meta_200`–`meta_299` | Token expired, revoked or missing permission | No | Issue a new system-user token, rotate (section 2) |
| `meta_131026` | Recipient cannot receive (not on WhatsApp, old app) | No | Nothing; the email still went |
| `meta_131047` | Outside the 24-hour window — a non-template was attempted | No | Report as a defect |
| `meta_131050` | Recipient opted out | No | Nothing |
| `meta_132001` | Template name/language not found or not approved | No | Fix the mapping or wait for approval |
| `meta_132000`, `meta_132012`, `meta_132018` | Variable count or format mismatch | No | Make the template match the table in section 4 |
| `meta_132015`, `meta_132016` | Template paused or disabled for low quality | No | Create a new template version |
| `meta_368`, `meta_131031`, `meta_130497`, `meta_131048`, `meta_131049` | Account restricted, country restriction, quality or engagement limit | No | Resolve in Meta Business Suite |
| `invalid_response` | Meta answered 2xx without a message id | No (to avoid a double send) | Investigate if it repeats |

Webhook not receiving: confirm the `messages` field is subscribed, the callback URL is the `whatsapp-webhook` function, `WHATSAPP_APP_SECRET` is the same app's secret (a mismatch yields `400` on every delivery), and that `verify_jwt` is off for the function.

Known limitation: the Cloud API has no idempotency key. If a send reached Meta but its answer was lost, the retry can deliver a second copy.

## References

- [ADR-0018: WhatsApp notification channel](adr/0018-whatsapp-notification-channel.md)
- [ADR-0010: Deferred scope](adr/0010-deferred-scope.md)
- [Edge functions](../supabase/functions/README.md)
- [Security and privacy](security-and-privacy.md)
- Meta, error codes — https://developers.facebook.com/docs/whatsapp/cloud-api/support/error-codes
- Meta, webhooks — https://developers.facebook.com/docs/graph-api/webhooks/getting-started
