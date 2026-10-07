# Installable app (PWA)

Client and Dashboard are each installable as a progressive web app: a
brand-driven web app manifest, a small service worker, a branded offline page,
and an install-instructions page in Arabic and English. There are no push
notifications. Platform Admin is not installable.

The two apps carry their own copies of the pieces below (apps never import
from each other); keep the copies in step when you change one.

| Piece | Client | Dashboard |
| --- | --- | --- |
| Manifest (`/manifest.webmanifest`) | `apps/client/app/manifest.ts` | `apps/dashboard/app/manifest.ts` |
| Service worker | `apps/client/public/sw.js` | `apps/dashboard/public/sw.js` |
| Registration + update prompt | `app/_lib/pwa-registration.tsx` | `app/_lib/pwa-registration.tsx` |
| Offline page | `/[locale]/offline` | `/[locale]/offline` |
| Install page | `/[locale]/install`, linked from the footer | `/[locale]/install`, linked from the account (two-step verification) page |
| Copy | page titles in `instance/content` (`pwa.*`, `footer.installApp`); browser steps and prompts in `app/_lib/pwa-copy.ts` | `app/_lib/pwa-copy.ts` |

## Manifest

Built at request time from the instance, never hard-coded:

- `name` / `short_name`: `brand.name` from `instance/content` in the instance
  default locale. The Dashboard appends a localized "Workspace" / "لوحة التحكم"
  suffix so a person with both installed can tell them apart.
- `lang` and `dir`: the instance default locale and its direction.
- `start_url` and `scope`: `/`. The root redirects to the person's remembered
  language, otherwise the instance default.
- `display: standalone`; `theme_color` is the brand primary colour and
  `background_color` the brand background (`brand.json` → `tokens.color`).
  Each layout also emits `theme-color` (with the dark primary under
  `prefers-color-scheme: dark` when the brand has `colorDark`),
  `<link rel="manifest">` and the apple-touch-icon through Next metadata.
- Icons: `any` and `maskable` PNGs at 192 and 512 px, see below.

## Icons and the tenant icon requirement

Browsers need square 192 px and 512 px icons; iOS needs an opaque 180 px
apple-touch-icon. Tenants provide only `brand.json` → `assets.icon`. On every
build and dev start, `loadInstanceBrand` (`packages/config/instance-brand.mjs`)
validates that PNG as before, then derives:

| File (under `/assets/_pwa/`) | Size | Background |
| --- | --- | --- |
| `icon-192.png`, `icon-512.png` (`purpose: any`) | 192, 512 | transparent; artwork fills the square |
| `maskable-192.png`, `maskable-512.png` (`purpose: maskable`) | 192, 512 | brand background; artwork kept inside the 80 % safe-zone circle (56 % of the side) |
| `apple-touch-icon.png` | 180 | brand background; artwork at 72 % |

The resize is done in plain Node (decode the already-validated PNG, resample
with premultiplied alpha, encode RGBA PNG), so no image library or native
dependency is added and `loadInstanceBrand` stays synchronous. A non-square
icon is centred, never stretched. `/assets/_pwa/` cannot collide with a tenant
asset, because tenant asset paths must start with a letter or digit.

**Tenant icon guidance:** supply a square PNG of **at least 512 × 512 px**
(the validator accepts up to 1024 × 1024 and 1 MB), with the mark centred and
some padding. Smaller icons still work but are upscaled and look soft on
high-density screens. The template ships a 64 px placeholder.

## What the service worker caches, and why

Only static files that are identical for everyone:

- **Precache on install:** `/ar/offline` and `/en/offline`, fetched **without
  cookies** (`credentials: "omit"`), plus the `/_next/static/`, `/fonts/` and
  `/assets/` files those pages reference. This is what makes the offline page
  render and style itself with no network.
- **Runtime, cache-first:** `/_next/static/` (content-hashed, immutable),
  `/fonts/`, `/assets/` (brand files and the generated icons). Only same-origin,
  successful responses are stored.
- **Navigations: network-first.** The network response is returned and never
  stored. Only when the network fails does the worker answer with the cached
  offline page for the URL's locale (`/` uses the instance default locale).

## What is never cached

The worker does not intercept these at all; they go straight to the network:

- any non-GET request, including **server actions** (POST);
- `/api/**`, `/auth/**` and `/manage/**`, with or without a locale prefix
  (management links carry secrets; auth responses set sessions);
- React Server Component and prefetch requests (`RSC` or
  `Next-Router-Prefetch` header, `_rsc` query parameter);
- cross-origin requests (Supabase, payment providers);
- `/_next/image`, the manifest, and anything else not listed above.

No navigation HTML is ever written to a cache, so an authenticated Dashboard
page, a booking, or a customer's details can never be served from the cache or
remain on a shared device after sign-out. The offline pages are public and read
no session or tenant data.

`packages/config` `createContentSecurityPolicy` allows `worker-src 'self'`
and `manifest-src 'self'`.

## Updates

The registration component runs only in production builds on secure origins
(HTTPS or localhost). It registers `/sw.js?v=<version>&l=<default locale>`;
`<version>` is `WLBP_PWA_VERSION` (set by each `next.config.ts` from the
deployment commit plus build time unless provided), so every build installs a
new worker with new cache names.

A new worker **waits**: it never calls `skipWaiting` on its own. The page shows
an "A new version is ready" prompt (foundation `Alert` + `Button`, Arabic and
English). Only when the person chooses **Update now** does the page message the
worker to activate and then reload once; **Later** keeps the current version
until every tab is closed. This prevents surprise reloads in the middle of a
form. On activation the worker deletes this app's older caches.

## Testing install

Use a production build (`pnpm --filter @wlbp/client build` then `next start`)
over HTTPS, or `http://localhost`, which browsers treat as secure.

- **Desktop Chrome / Edge:** open the site; the install icon appears at the end
  of the address bar, or use the "Install app" button on `/<locale>/install`.
  DevTools → Application → Manifest shows errors and the icons; Service
  workers shows the active and waiting worker; Cache storage lists the caches.
- **Android Chrome:** menu (three dots) → Install app / Add to Home screen, or
  the install button on the install page. Use `chrome://inspect` for DevTools.
- **iOS / iPadOS Safari:** Share → Add to Home Screen. iOS has no install
  prompt event, so the install page shows the manual steps only.
- **Offline:** DevTools → Network → Offline (or Playwright
  `context.setOffline(true)`), then navigate: the branded offline page appears
  in the URL's language; "Try again" reloads the requested address.
- **Update:** deploy or rebuild, reload once; the update prompt appears.

Unit tests: `app/_lib/service-worker.test.ts` in each app runs `sw.js` in a VM
and asserts the never-cache list, cache-first statics, offline fallback, and
that activation waits for the person. `packages/config/instance-brand.test.mjs`
covers icon generation.

## Uninstalling and clearing

- **Desktop:** open the installed app → app menu → Uninstall; or
  `chrome://apps` / `edge://apps`.
- **Android:** long-press the icon → App info → Uninstall (or drag to Remove).
- **iOS:** long-press the icon → Remove App → Delete from Home Screen.
- To remove the worker and caches without uninstalling: DevTools →
  Application → Storage → Clear site data. Signing out does not need this,
  because nothing personal is cached.
