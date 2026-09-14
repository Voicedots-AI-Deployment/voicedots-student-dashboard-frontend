import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const target = env.STUDENT_API_PROXY_TARGET || "http://127.0.0.1:8005";
  const apiBase = (env.VITE_API_URL || "").replace(/\/+$/, "");
  if (apiBase) {
    const url = new URL(apiBase);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.pathname !== "/" || url.search || url.hash)
      throw new Error("VITE_API_URL must be an HTTP(S) origin, without a path or credentials.");
  }
  const runtimeConfig = `window.__API_BASE__ = ${JSON.stringify(apiBase)};\n`;
  return {
    plugins: [react(), {
      name: "student-api-runtime-config",
      generateBundle() {
        this.emitFile({ type: "asset", fileName: "student-api-config.js", source: runtimeConfig });
      },
      configureServer(server) {
        server.middlewares.use("/student-api-config.js", (_req, res) => {
          res.setHeader("Content-Type", "application/javascript");
          res.setHeader("Cache-Control", "no-store");
          res.end(runtimeConfig);
        });
      },
    }],
    server: {
      host: "127.0.0.1",
      port: 5175,
      proxy: {
        "/api": { target, changeOrigin: true },
        "/ws": { target, ws: true, changeOrigin: true },
      },
    },
  };
});
