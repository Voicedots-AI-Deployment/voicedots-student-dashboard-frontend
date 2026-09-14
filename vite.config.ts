import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const target = env.STUDENT_API_PROXY_TARGET || "http://127.0.0.1:8002";
  return {
    plugins: [react()],
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
