import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const target = process.env.NEATBOLT_URL ?? "http://localhost:4100";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: "/",
  build: { outDir: "dist", emptyOutDir: true, sourcemap: false, chunkSizeWarningLimit: 900 },
  server: {
    port: 5173,
    proxy: {
      "/api": { target, changeOrigin: true, headers: { origin: target } },
      "/health": { target, changeOrigin: true },
    },
  },
});
