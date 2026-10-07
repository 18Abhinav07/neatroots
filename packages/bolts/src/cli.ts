#!/usr/bin/env node
import { Command } from "commander";
import { Bolts } from "./core.js";
import { createApp, startServer, VERSION } from "./server/app.js";

const program = new Command();
program.name("bolts").description("Local, private checks for AI agents while they run").version(VERSION);

program
  .command("start")
  .description("Run the Bolts collector, checks, app and MCP server")
  .option("-p, --port <port>", "port to listen on")
  .action(async (opts) => {
    const bolts = new Bolts();
    if (opts.port) bolts.config.port = Number(opts.port);
    const app = createApp(bolts);
    await startServer(bolts, app);
    const stop = () => {
      bolts.close();
      process.exit(0);
    };
    process.on("SIGINT", stop);
    process.on("SIGTERM", stop);
  });

program.parseAsync().catch((err) => {
  console.error(err);
  process.exit(1);
});
