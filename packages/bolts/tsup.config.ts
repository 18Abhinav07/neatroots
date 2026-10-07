import { defineConfig } from "tsup";

export default defineConfig({
  entry: { cli: "src/cli.ts", index: "src/index.ts" },
  format: ["esm"],
  target: "node22",
  platform: "node",
  sourcemap: true,
  clean: true,
  dts: { entry: { index: "src/index.ts" } },
  banner: ({ format }) => (format === "esm" ? { js: "" } : {}),
  external: ["better-sqlite3"],
});
