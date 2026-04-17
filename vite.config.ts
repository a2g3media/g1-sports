import path from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { cloudflare } from "@cloudflare/vite-plugin";
import { mochaPlugins } from "@getmocha/vite-plugins";

function resolveBuildId(): string {
  const fromGitHub = String(process.env.GITHUB_SHA || "").trim();
  if (fromGitHub) return fromGitHub.slice(0, 12);
  const fromCfPages = String(process.env.CF_PAGES_COMMIT_SHA || "").trim();
  if (fromCfPages) return fromCfPages.slice(0, 12);
  // Fallback keeps service worker script URL unique per build.
  return `${Date.now()}`;
}

const appBuildId = resolveBuildId();

export default defineConfig({
  appType: "spa",
  define: {
    __APP_BUILD_ID__: JSON.stringify(appBuildId),
  },
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
