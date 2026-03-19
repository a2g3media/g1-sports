import path from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { cloudflare } from "@cloudflare/vite-plugin";
import { mochaPlugins } from "@getmocha/vite-plugins";

export default defineConfig({
  appType: "spa",
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  plugins: [
    ...mochaPlugins(process.env as any),
    react(),
    cloudflare({
      // auxiliaryWorkers disabled for local dev: /mocha/emails-service is Mocha-infra only.
      // Production still uses wrangler.json service binding to emails-service.
      // Avoid inspector auto-port detection, which can fail in restricted runtimes.
      inspectorPort: false,
    }),
  ],
  server: {
    allowedHosts: true,
    strictPort: false,
  },
  build: {
    chunkSizeWarningLimit: 5000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react-is"],
  },
  optimizeDeps: {
    include: ["react", "react-dom", "react-is"],
  },
});
