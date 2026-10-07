import type { Hono } from "hono";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { Bolts } from "../core.js";
import { createMcpServer } from "./server.js";

/** Streamable HTTP MCP on /mcp, stateless: each request gets a fresh server over the shared Bolts state. */
export function mountMcpHttp(app: Hono, bolts: Bolts): void {
  app.all("/mcp", async (c) => {
    const port = bolts.config.port;
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
      enableDnsRebindingProtection: true,
      allowedHosts: [`localhost:${port}`, `127.0.0.1:${port}`, `[::1]:${port}`, "localhost", "127.0.0.1"],
    });
    const server = createMcpServer(bolts);
    await server.connect(transport);
    const res = await transport.handleRequest(c.req.raw);
    // Close after the response body is consumed (JSON responses are complete already).
    void Promise.resolve().then(() => setTimeout(() => void server.close(), 30_000).unref());
    return res;
  });
}
