# References

Purpose: the official vendor, standards, and regulatory sources this repository's architecture is based on, grouped as in the spec, with a revalidation schedule.

Authoritative source: [the architecture spec](../WHITE_LABEL_BOOKING_PLATFORM_PRODUCT_ARCHITECTURE.md), §33 "Research basis and official references".

> **POINT-IN-TIME. REVALIDATE BEFORE YOU RELY ON ANY OF IT.**
> Every vendor limit, price, quota, feature availability, regional availability, and legal or regulatory statement recorded in this repository was true only at the date it was written. Vendors change limits, pricing, and supported countries without notice, and regulations change independently of both.
> **These are not legal advice and not compliance claims.** No statement here certifies that the platform is compliant with any law, standard, or contract. Confirm limits and pricing with the vendor at implementation and procurement time, and confirm anything legal or regulatory with qualified counsel in the relevant jurisdiction before launch.

## Revalidate before

| Group | Revalidate before | Why |
| --- | --- | --- |
| Product and accessibility | M1 (before UI foundation and booking model work) | Competitor feature baselines drift; WCAG 2.2, RFC 5545, and IANA tzdata are versioned and update on their own cadence. |
| Next.js, repository, and deployment | M5 (before the distribution/provisioning boundary is built) | GitHub App, ruleset, template, and Vercel project/rollback APIs and plan limits gate the managed-fork model. |
| Supabase and PostgreSQL | M1 (before schema, RLS, and availability work) | Plan quotas, branching, Queues/Cron availability, and backup retention decide what the data layer can promise. |
| Email, payments, and calendars | Email before M2; payments before M4; calendars before any calendar-sync work | Sending limits and domain rules shape onboarding; provider charge models, fees, and country availability decide the merchant model. |
| Saudi data and payment references | Before any KSA launch — **out of first-release scope** | PDPL/SDAIA, SAMA licensing, and ZATCA e-invoicing obligations require counsel and a licensed provider; nothing here anticipates that review. |

Milestone labels above are repository milestones, not dates. If a milestone is renumbered, keep the ordering: platform limits first, distribution before it is automated, payments before money moves, KSA before any KSA launch.

## Product and accessibility

- [Cal.com Platform white-label APIs/components](https://cal.com/docs/platform/introduction)
- [Calendly event types](https://calendly.com/help/event-types-overview)
- [Microsoft Bookings scheduling policies](https://learn.microsoft.com/en-us/microsoft-365/bookings/set-scheduling-policies?view=o365-worldwide)
- [WCAG 2.2](https://www.w3.org/TR/WCAG22/)
- [IANA time zones](https://www.iana.org/time-zones)
- [iCalendar RFC 5545](https://datatracker.ietf.org/doc/html/rfc5545)

## Next.js, repository, and deployment

- [Next.js authentication](https://nextjs.org/docs/app/guides/authentication)
- [Next.js multi-tenant guide](https://nextjs.org/docs/app/guides/multi-tenant)
- [Next.js Content Security Policy](https://nextjs.org/docs/app/guides/content-security-policy)
- [pnpm workspaces](https://pnpm.io/workspaces)
- [Turborepo repository structure](https://turborepo.dev/docs/crafting-your-repository/structuring-a-repository)
- [GitHub forks](https://docs.github.com/en/pull-requests/reference/forks)
- [GitHub repository templates](https://docs.github.com/en/repositories/creating-and-managing-repositories/creating-a-repository-from-a-template)
- [GitHub App installation authentication](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/authenticating-as-a-github-app-installation)
- [GitHub rulesets](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets)
- [Vercel monorepos](https://vercel.com/docs/monorepos)
- [Vercel for Platforms](https://vercel.com/docs/platforms)
- [Vercel project API](https://vercel.com/docs/rest-api/projects/create-a-new-project)
- [Vercel Instant Rollback](https://vercel.com/docs/instant-rollback)

## Supabase and PostgreSQL

- [Supabase Next.js SSR](https://supabase.com/docs/guides/auth/server-side/creating-a-client?queryGroups=framework&framework=nextjs)
- [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase database functions](https://supabase.com/docs/guides/database/functions)
- [Supabase Edge Functions](https://supabase.com/docs/guides/functions)
- [Supabase Queues](https://supabase.com/docs/guides/queues)
- [Supabase Cron](https://supabase.com/docs/guides/cron)
- [Supabase Realtime authorization](https://supabase.com/docs/guides/realtime/authorization)
- [Supabase Storage access control](https://supabase.com/docs/guides/storage/security/access-control)
- [Supabase database testing](https://supabase.com/docs/guides/database/testing)
- [Supabase branching/environments](https://supabase.com/docs/guides/deployment/branching)
- [Supabase production checklist](https://supabase.com/docs/guides/deployment/going-into-prod)
- [Supabase database backups](https://supabase.com/docs/guides/platform/backups)
- [PostgreSQL range/exclusion constraints](https://www.postgresql.org/docs/current/rangetypes.html)
- [PostgreSQL row security](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)

## Email, payments, and calendars

- [Resend with Supabase Edge Functions](https://resend.com/docs/send-with-supabase-edge-functions)
- [Resend multi-tenant guidance](https://resend.com/docs/knowledge-base/setting-up-resend-for-multi-tenants)
- [Resend verified domains](https://resend.com/docs/dashboard/domains/introduction)
- [Resend idempotency](https://resend.com/docs/dashboard/emails/idempotency-keys)
- [Resend webhook behavior](https://resend.com/docs/webhooks/introduction)
- [Supabase custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp)
- [Supabase Send Email Hook](https://supabase.com/docs/guides/auth/auth-hooks/send-email-hook)
- [Stripe Connect charge models](https://docs.stripe.com/connect/charges)
- [Stripe Connect direct charges](https://docs.stripe.com/connect/direct-charges)
- [Stripe Accounts v2](https://docs.stripe.com/connect/accounts-v2)
- [Stripe Checkout Sessions](https://docs.stripe.com/payments/checkout)
- [Stripe global availability](https://stripe.com/global)
- [Google Calendar incremental synchronization](https://developers.google.com/workspace/calendar/api/guides/sync)
- [Google Calendar push notifications](https://developers.google.com/workspace/calendar/api/guides/push)
- [Microsoft Graph event delta](https://learn.microsoft.com/en-us/graph/api/event-delta?view=graph-rest-1.0)
- [Microsoft Graph change notifications](https://learn.microsoft.com/en-us/graph/change-notifications-overview)

## Saudi data and payment references

Out of first-release scope. Listed so that a future KSA decision starts from official sources, not from assumptions carried over from the non-KSA build.

- [SDAIA data protection](https://sdaia.gov.sa/en/Research/Pages/DataProtection.aspx)
- [Saudi Personal Data Protection Law — English](https://sdaia.gov.sa/en/SDAIA/about/Documents/Personal%20Data%20English%20V2-23April2023-%20Reviewed-.pdf)
- [SAMA Payments Law](https://rulebook.sama.gov.sa/en/law-payments-and-payment-services)
- [SAMA licensed payment providers](https://sama.gov.sa/en-US/Supervision/LicenseEntities/Pages/Licensed_Payment_Service_Providers_companies.aspx)
- [ZATCA e-invoicing](https://zatca.gov.sa/en/E-Invoicing/Pages/default.aspx)

## Related documents

- [Documentation index](./README.md)
- [Architecture overview](./architecture.md)
- [Glossary](./glossary.md)
- [Release scope](./release-scope.md)
- [Security and privacy](./security-and-privacy.md)
- [Architecture decision records](./adr/README.md)
