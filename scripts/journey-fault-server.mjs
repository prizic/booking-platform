#!/usr/bin/env node
// Verification-only local proxy: preserve real tenant/auth reads, fail catalog
// RPCs. Browser interception cannot exercise a server-rendered DAL failure.
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import {
  readLocalSupabaseEnvironment,
  createLiveBookingApplicationEnvironment,
} from "./live-booking-e2e.mjs";
import { platformAdminChildEnvironment } from "./platform-admin-local.mjs";
import { assertNode22 } from "./demo-dev.mjs";
assertNode22();
const [app, host, portText] = process.argv.slice(2);
if (
  !["client", "dashboard", "admin"].includes(app) ||
  !(app === "admin"
    ? host === "platform-admin.local"
    : host?.endsWith(".dashboard-completion.example.invalid")) ||
  !/^(?:4173[67]|41743)$/u.test(portText ?? "")
)
  throw new Error(
    "Usage: journey-fault-server.mjs client|dashboard|admin <completion hostname|platform-admin.local> 41736|41737|41743",
  );
const local = readLocalSupabaseEnvironment();
const api = new URL(local.apiUrl);
if (
  !["127.0.0.1", "localhost", "[::1]"].includes(api.hostname) ||
  !["55321", "57721", "57821", "57921"].includes(api.port)
)
  throw new Error("Fault proxy requires the local isolated campaign");
const proxyPort = app === "client" ? 59136 : app === "dashboard" ? 59137 : 59143;
const server = createServer(async (req, res) => {
  // Routing/publication/auth still comes from the actual isolated database.
  if (
    (app === "admin"
      ? /\/rest\/v1\/rpc\/list_/u
      : /\/rest\/v1\/(?:rpc\/(?:.*catalog.*|list_services_v1|get_today_workspace_v1)|.*catalog.*)/u
    ).test(req.url ?? "")
  ) {
    res.writeHead(503, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        code: "synthetic_read_unavailable",
        message: "Read temporarily unavailable",
      }),
    );
    return;
  }
  try {
    const destination = new URL(req.url, api);
    if (destination.origin !== api.origin) {
      res.writeHead(400);
      res.end("Only the local fixture backend may be forwarded");
      return;
    }
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const headers = { ...req.headers };
    delete headers.host;
    delete headers.connection;
    delete headers["content-length"];
    const response = await fetch(destination, {
      method: req.method,
      headers,
      body: ["GET", "HEAD"].includes(req.method) ? undefined : Buffer.concat(chunks),
      redirect: "manual",
      signal: AbortSignal.timeout(30000),
    });
    const out = Object.fromEntries(response.headers);
    delete out["content-encoding"];
    delete out["content-length"];
    res.writeHead(response.status, out);
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch {
    res.writeHead(503);
    res.end("Local fixture backend unavailable");
  }
});
await new Promise((resolve, reject) => {
  server.once("error", (error) => {
    const code =
      error && typeof error === "object" && "code" in error
        ? String(error.code)
        : "proxy_listen_error";
    console.error(
      `[journey-fault-server:${app}:${portText}] proxy failed on ${proxyPort} (${code})`,
    );
    reject(error);
  });
  server.listen(proxyPort, "127.0.0.1", resolve);
});
const child = spawn(
  "pnpm",
  [
    "--filter",
    `@wlbp/${app === "admin" ? "platform-admin" : app}`,
    "exec",
    "next",
    "dev",
    "--port",
    portText,
  ],
  {
    env: {
      ...(app === "admin"
        ? platformAdminChildEnvironment(
            { ...local, apiUrl: `http://127.0.0.1:${proxyPort}` },
            portText,
          )
        : createLiveBookingApplicationEnvironment(
            process.env,
            { ...local, apiUrl: `http://127.0.0.1:${proxyPort}` },
            host,
          )),
      WLBP_NEXT_DIST_DIR: `.next-journey-fault-${app}`,
      ...(app === "admin"
        ? { PLATFORM_ADMIN_DIST_DIR: ".next-journey-fault-admin" }
        : {}),
    },
    stdio: ["ignore", "pipe", "pipe"],
  },
);
const stop = () => {
  child.kill("SIGTERM");
  server.close();
};
// Next.js stdout/stderr can contain customer data, credentials, or source paths.
// Retain only the fact that output occurred; do not forward raw bytes.
let hasChildOutput = false;
child.stdout?.on("data", () => {
  hasChildOutput = true;
});
child.stderr?.on("data", () => {
  hasChildOutput = true;
});
child.once("error", (error) => {
  const code =
    error && typeof error === "object" && "code" in error
      ? String(error.code)
      : "child_spawn_error";
  console.error(
    `[journey-fault-server:${app}:${portText}] child process failed on port ${portText} (${code})`,
  );
  stop();
  process.exitCode = 1;
});
process.on("SIGINT", stop);
process.on("SIGTERM", stop);

child.once("exit", (code) => {
  if (hasChildOutput) {
    console.error(
      `[journey-fault-server:${app}:${portText}] child process exited on port ${portText} with code ${code ?? 0}`,
    );
  }
  server.close();
  process.exitCode = code ?? 0;
});
