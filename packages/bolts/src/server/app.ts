import { Hono } from "hono";
import { serve, type ServerType } from "@hono/node-server";
import type { Bolts } from "../core.js";
import { mountCollector } from "./collector.js";
import { log } from "../util/log.js";

export const VERSION = "0.1.0";

export function createApp(bolts: Bolts): Hono {
  const app = new Hono();

  app.get("/health", (c) =>
    c.json({ ok: true, name: "bolts", version: VERSION, uptime_ms: Date.now() - bolts.startedMs }),
  );

  mountCollector(app, bolts);
  return app;
}

export function startServer(bolts: Bolts, app: Hono): Promise<ServerType> {
  return new Promise((resolve, reject) => {
    const server = serve({ fetch: app.fetch, port: bolts.config.port, hostname: bolts.config.host }, (info) => {
      log.info(`listening on http://${bolts.config.host}:${info.port}`);
      resolve(server);
    });
    server.on("error", reject);
  });
}
