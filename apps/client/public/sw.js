/*
 * Client service worker (plain JS, no build step). See docs/pwa.md.
 *
 * Caches ONLY static, credential-independent files:
 *   - precache: the offline page for each locale and the static files it loads
 *     (scripts, styles, the brand icon, and the fonts its stylesheets use);
 *   - runtime, cache-first: /_next/static/, /fonts/, /assets/ (brand files and
 *     the generated app icons under /assets/_pwa/).
 * Navigations are network-first; when the network fails the cached offline
 * page for the request's locale is shown. Navigation HTML is never stored.
 * Everything else passes straight through to the network and is never cached:
 * /api, /auth, /manage, React Server Component and prefetch requests, server
 * actions and every other non-GET request, cross-origin requests.
 *
 * The registration URL carries the build version (?v=) and the instance
 * default locale (?l=). A new build therefore installs a new worker with new
 * cache names; it waits until the person accepts the "update available"
 * prompt, which posts SKIP_WAITING, and old caches are deleted on activate.
 */
const APP = "wlbp-client";
const LOCALES = ["ar", "en"];
const parameters = new URL(self.location.href).searchParams;
const VERSION = (parameters.get("v") || "0").replace(/[^A-Za-z0-9._-]/g, "");
const DEFAULT_LOCALE = LOCALES.includes(parameters.get("l"))
  ? parameters.get("l")
  : LOCALES[0];
const OFFLINE_CACHE = `${APP}-offline-${VERSION}`;
const STATIC_CACHE = `${APP}-static-${VERSION}`;

const STATIC_PATH = /^\/(?:_next\/static|fonts|assets)\//;
const NEVER_CACHED_PATH = /^\/(?:(?:ar|en)\/)?(?:api|auth|manage)(?:\/|$)/;
const OFFLINE_ASSET = /\/(?:_next\/static|fonts|assets)\/[^"'\\\s<>()?#]+/g;

function offlinePath(locale) {
  return `/${locale}/offline`;
}

async function precacheOfflinePages() {
  const offline = await caches.open(OFFLINE_CACHE);
  const assets = new Set();
  for (const locale of LOCALES) {
    // Fetched without cookies, so nothing person-specific can be stored.
    const response = await fetch(offlinePath(locale), {
      cache: "no-store",
      credentials: "omit",
    });
    if (!response.ok) throw new Error(`Offline page ${locale} is unavailable`);
    const html = await response.clone().text();
    for (const match of html.matchAll(OFFLINE_ASSET)) assets.add(match[0]);
    await offline.put(offlinePath(locale), response);
  }
  const staticCache = await caches.open(STATIC_CACHE);
  const store = async (asset) => {
    const response = await fetch(asset, { credentials: "omit" });
    if (!response.ok) return;
    if (asset.endsWith(".css")) {
      // Fonts are referenced from the stylesheets, not the HTML.
      const css = await response.clone().text();
      await Promise.allSettled(
        [...css.matchAll(OFFLINE_ASSET)]
          .map((match) => match[0])
          .filter((font) => !assets.has(font))
          .map(async (font) => {
            assets.add(font);
            const fontResponse = await fetch(font, { credentials: "omit" });
            if (fontResponse.ok) await staticCache.put(font, fontResponse);
          }),
      );
    }
    await staticCache.put(asset, response);
  };
  await Promise.allSettled([...assets].map(store));
}

self.addEventListener("install", (event) => {
  // No skipWaiting here: a new version waits for the person to accept it.
  event.waitUntil(precacheOfflinePages());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const current = new Set([OFFLINE_CACHE, STATIC_CACHE]);
      for (const name of await caches.keys()) {
        if (name.startsWith(`${APP}-`) && !current.has(name)) await caches.delete(name);
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

async function cacheFirst(request) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok && response.type === "basic")
    await cache.put(request, response.clone());
  return response;
}

async function networkFirstNavigation(request, url) {
  try {
    return await fetch(request);
  } catch (error) {
    const first = url.pathname.split("/")[1];
    const locale = LOCALES.includes(first) ? first : DEFAULT_LOCALE;
    const cached = await caches.match(offlinePath(locale), {
      cacheName: OFFLINE_CACHE,
    });
    if (cached) return cached;
    throw error;
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  // Server actions and every other mutation go straight to the network.
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (NEVER_CACHED_PATH.test(url.pathname)) return;
  // React Server Component payloads and router prefetches are data, not files.
  if (
    request.headers.has("RSC") ||
    request.headers.has("Next-Router-Prefetch") ||
    url.searchParams.has("_rsc")
  ) {
    return;
  }
  if (request.mode === "navigate") {
    event.respondWith(networkFirstNavigation(request, url));
    return;
  }
  if (STATIC_PATH.test(url.pathname)) {
    event.respondWith(cacheFirst(request));
  }
  // Anything else: no respondWith, so the browser fetches it normally.
});
