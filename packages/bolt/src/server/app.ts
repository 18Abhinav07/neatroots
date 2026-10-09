import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Hono } from "hono";
import { serve, type ServerType } from "@hono/node-server";
import type { Bolt } from "../core.js";
import { mountCollector } from "./collector.js";
import { mountApi } from "./api.js";
import { mountMcpHttp } from "../mcp/http.js";
import { log } from "../util/log.js";
import { VERSION } from "../version.js";

export { VERSION };

function findUiDir(): string | undefined {
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 6; i++) {
    for (const candidate of [path.join(dir, "ui"), path.join(dir, "dist", "ui"), path.join(dir, "..", "ui", "dist")]) {
      if (fs.existsSync(path.join(candidate, "index.html"))) return candidate;
    }
    dir = path.dirname(dir);
  }
  return undefined;
}

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".json": "application/json",
  ".woff2": "font/woff2",
};

/**
 * Bolt listens on loopback only. The Host check blocks DNS-rebinding pages, and the
 * Origin check stops other websites from calling the app API from a browser. The OTLP
 * routes stay open to any origin so browser SDKs can send traces.
 */
function securityMiddleware(bolts: Bolt) {
  return async (c: import("hono").Context, next: () => Promise<void>) => {
    const port = bolts.config.port;
    const host = (c.req.header("host") ?? "").toLowerCase();
    const hostOk = ["localhost", "127.0.0.1", "[::1]"].some((h) => host === h || host === `${h}:${port}`);
    if (!hostOk) return c.json({ error: "Bolt only answers on localhost" }, 403);
    const origin = c.req.header("origin");
    const isOtlp = c.req.path.startsWith("/v1/");
    if (isOtlp) {
      if (c.req.method === "OPTIONS") {
        return new Response(null, {
          status: 204,
          headers: {
            "access-control-allow-origin": "*",
            "access-control-allow-methods": "POST, OPTIONS",
            "access-control-allow-headers": "content-type, content-encoding, x-api-key, x-neatlogs-doctor",
            "access-control-max-age": "86400",
          },
        });
      }
      await next();
      c.res.headers.set("access-control-allow-origin", "*");
      return;
    }
    if (origin) {
      const allowed = new Set([`http://localhost:${port}`, `http://127.0.0.1:${port}`, `http://[::1]:${port}`]);
      if (process.env.NEATBOLT_DEV_ORIGIN) allowed.add(process.env.NEATBOLT_DEV_ORIGIN);
      if (!allowed.has(origin.toLowerCase())) return c.json({ error: "cross-origin requests are not allowed" }, 403);
    }
    await next();
  };
}

export function createApp(bolts: Bolt): Hono {
  const app = new Hono();
  app.use("*", securityMiddleware(bolts));

  app.get("/health", (c) => c.json({ ok: true, name: "neatbolt", version: VERSION, uptime_ms: Date.now() - bolts.startedMs }));

  mountCollector(app, bolts);
  mountApi(app, bolts);
  mountMcpHttp(app, bolts);

  const uiDir = findUiDir();
  app.get("*", (c) => {
    if (!uiDir) {
      return c.html(
        `<!doctype html><title>Bolt</title><body style="font-family:system-ui;padding:2rem"><h1>Bolt is running</h1><p>The app UI is not built. Run <code>pnpm build</code> in the Bolt repo.</p><p>Collector: <code>POST /v1/traces</code></p></body>`,
      );
    }
    const rel = decodeURIComponent(c.req.path).replace(/^\/+/, "");
    let file = path.join(uiDir, rel);
    if (!file.startsWith(uiDir) || !rel || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(uiDir, "index.html");
    const ext = path.extname(file);
    const headers: Record<string, string> = { "content-type": MIME[ext] ?? "application/octet-stream" };
    if (rel.startsWith("assets/")) headers["cache-control"] = "public, max-age=31536000, immutable";
    return new Response(fs.readFileSync(file), { headers });
  });
  return app;
}

export function startServer(bolts: Bolt, app: Hono): Promise<ServerType> {
  return new Promise((resolve, reject) => {
    const server = serve({ fetch: app.fetch, port: bolts.config.port, hostname: bolts.config.host }, (info) => {
      log.info(`listening on http://localhost:${info.port}`);
      resolve(server);
    });
    server.on("error", reject);
  });
}
