import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

const source = readFileSync(new URL("../../public/sw.js", import.meta.url), "utf8");
const origin = "https://booking.example";
const app = "wlbp-client";

type Handler = (event: Record<string, unknown>) => void;

function loadWorker(query = "?v=build-1&l=en") {
  const handlers = new Map<string, Handler>();
  const stored = new Map<string, Map<string, Response>>();
  const open = vi.fn(async (name: string) => {
    const entries = stored.get(name) ?? new Map<string, Response>();
    stored.set(name, entries);
    return {
      match: async (request: Request | string) =>
        entries.get(typeof request === "string" ? request : request.url),
      put: vi.fn(async (request: Request | string, response: Response) => {
        entries.set(typeof request === "string" ? request : request.url, response);
      }),
    };
  });
  const caches = {
    open,
    keys: async () => [...stored.keys()],
    delete: vi.fn(async (name: string) => stored.delete(name)),
    match: vi.fn(async (key: string, options: { cacheName: string }) =>
      stored.get(options.cacheName)?.get(key),
    ),
  };
  const self = {
    location: { href: `${origin}/sw.js${query}`, origin },
    addEventListener: (type: string, handler: Handler) => handlers.set(type, handler),
    skipWaiting: vi.fn(),
    clients: { claim: vi.fn(async () => undefined) },
  };
  const fetch = vi.fn<
    (input: Request | string, init?: RequestInit) => Promise<Response>
  >(
    // Same-origin network responses are "basic"; a bare Response is "default".
    async () => Object.defineProperty(new Response("ok"), "type", { value: "basic" }),
  );
  runInNewContext(source, { self, caches, fetch, URL, Response, Promise, Set });
  return { caches, fetch, handlers, self, stored };
}

function fetchEvent(
  path: string,
  init: { method?: string; mode?: string; headers?: Record<string, string> } = {},
) {
  const url = path.startsWith("http") ? path : `${origin}${path}`;
  const respondWith = vi.fn();
  return {
    event: {
      request: {
        method: init.method ?? "GET",
        mode: init.mode ?? "no-cors",
        url,
        headers: new Headers(init.headers),
      },
      respondWith,
    },
    respondWith,
  };
}

describe("Client service worker", () => {
  it("never intercepts data, auth, management, actions or cross-origin requests", () => {
    const { handlers } = loadWorker();
    const onFetch = handlers.get("fetch")!;
    for (const [path, init] of [
      ["/api/availability?date=2026-10-07", {}],
      ["/ar/manage/secret-token", { mode: "navigate" }],
      ["/manage/secret-token", { mode: "navigate" }],
      ["/en/auth/callback", { mode: "navigate" }],
      ["/auth/confirm", {}],
      ["/ar/book", { method: "POST", mode: "navigate" }],
      ["/ar/book", { headers: { RSC: "1" } }],
      ["/ar/book?_rsc=abc", {}],
      ["/ar", { headers: { "Next-Router-Prefetch": "1" } }],
      ["/ar/book", {}],
      ["/manifest.webmanifest", {}],
      ["https://cdn.example/_next/static/chunks/a.js", {}],
    ] as const) {
      const { event, respondWith } = fetchEvent(path, init);
      onFetch(event);
      expect(respondWith, `${path} ${JSON.stringify(init)}`).not.toHaveBeenCalled();
    }
  });

  it("serves static files cache-first and stores them for later", async () => {
    const { handlers, stored } = loadWorker();
    for (const path of [
      "/_next/static/chunks/app.js",
      "/fonts/inter.woff2",
      "/assets/_pwa/icon-192.png",
    ]) {
      const { event, respondWith } = fetchEvent(path);
      handlers.get("fetch")!(event);
      expect(respondWith).toHaveBeenCalledOnce();
      await respondWith.mock.calls[0]![0];
    }
    expect([...stored.get(`${app}-static-build-1`)!.keys()]).toHaveLength(3);
  });

  it("falls back to the locale's offline page without storing navigation HTML", async () => {
    const { fetch, handlers, stored } = loadWorker();
    stored.set(
      `${app}-offline-build-1`,
      new Map([
        ["/ar/offline", new Response("ar offline")],
        ["/en/offline", new Response("en offline")],
      ]),
    );
    fetch.mockRejectedValue(new TypeError("offline"));

    const arabic = fetchEvent("/ar/book", { mode: "navigate" });
    handlers.get("fetch")!(arabic.event);
    expect(await (await arabic.respondWith.mock.calls[0]![0]).text()).toBe(
      "ar offline",
    );

    // `/` carries no locale, so the instance default (?l=en) applies.
    const root = fetchEvent("/", { mode: "navigate" });
    handlers.get("fetch")!(root.event);
    expect(await (await root.respondWith.mock.calls[0]![0]).text()).toBe("en offline");

    expect(stored.has(`${app}-static-build-1`)).toBe(false);
  });

  it("waits for the person before activating, then clears only old caches", async () => {
    const { caches, handlers, self, stored } = loadWorker();
    stored.set(`${app}-static-old`, new Map());
    stored.set("someone-else", new Map());

    let installed: Promise<unknown> | undefined;
    handlers.get("install")!({
      waitUntil: (work: Promise<unknown>) => (installed = work),
    });
    await installed;
    expect(self.skipWaiting).not.toHaveBeenCalled();
    expect([...stored.get(`${app}-offline-build-1`)!.keys()]).toEqual([
      "/ar/offline",
      "/en/offline",
    ]);

    let activated: Promise<unknown> | undefined;
    handlers.get("activate")!({
      waitUntil: (work: Promise<unknown>) => (activated = work),
    });
    await activated;
    expect(caches.delete).toHaveBeenCalledWith(`${app}-static-old`);
    expect(caches.delete).not.toHaveBeenCalledWith("someone-else");

    handlers.get("message")!({ data: { type: "SKIP_WAITING" } });
    expect(self.skipWaiting).toHaveBeenCalledOnce();
  });

  it("precaches offline pages without cookies", async () => {
    const { fetch, handlers } = loadWorker();
    let installed: Promise<unknown> | undefined;
    handlers.get("install")!({
      waitUntil: (work: Promise<unknown>) => (installed = work),
    });
    await installed;
    for (const call of fetch.mock.calls.filter(([url]) =>
      String(url).endsWith("/offline"),
    )) {
      expect(call[1]).toMatchObject({ credentials: "omit" });
    }
  });
});
