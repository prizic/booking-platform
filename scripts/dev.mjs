import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { fileURLToPath, pathToFileURL } from "node:url";

export function isPortAvailable(port) {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", (error) => {
      if (error.code === "EADDRINUSE" || error.code === "EACCES") resolve(false);
      else reject(error);
    });
    server.listen(port, () => server.close(() => resolve(true)));
  });
}

export async function selectDevPorts(preferred, available = isPortAvailable) {
  const reserved = new Set(preferred);
  const selected = [];
  for (const preferredPort of preferred) {
    let port = preferredPort;
    while (
      port <= 65535 &&
      (selected.includes(port) ||
        (port !== preferredPort && reserved.has(port)) ||
        !(await available(port)))
    ) {
      port += 1;
    }
    if (port > 65535) throw new Error("No available development port remains.");
    selected.push(port);
  }
  return selected;
}

async function main() {
  const apps = [
    ["Client", "CLIENT_PORT", 3000],
    ["Dashboard", "DASHBOARD_PORT", 3001],
    ["Platform Admin", "PLATFORM_ADMIN_PORT", 3002],
  ];
  const ports = await selectDevPorts(apps.map(([, , port]) => port));
  const env = { ...process.env };
  for (const [index, [name, variable, preferred]] of apps.entries()) {
    env[variable] = String(ports[index]);
    const fallback = ports[index] === preferred ? "" : ` (${preferred} is in use)`;
    console.log(`${name}: http://localhost:${ports[index]}${fallback}`);
  }

  const child = spawn(
    "pnpm",
    ["exec", "turbo", "run", "dev", ...process.argv.slice(2)],
    {
      cwd: fileURLToPath(new URL("..", import.meta.url)),
      env,
      stdio: "inherit",
    },
  );
  const forwardSignal = (signal) => child.kill(signal);
  process.on("SIGINT", forwardSignal);
  process.on("SIGTERM", forwardSignal);
  try {
    process.exitCode = await new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("exit", (code, signal) => {
        resolve(code ?? (signal === "SIGINT" ? 130 : 143));
      });
    });
  } finally {
    process.off("SIGINT", forwardSignal);
    process.off("SIGTERM", forwardSignal);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
