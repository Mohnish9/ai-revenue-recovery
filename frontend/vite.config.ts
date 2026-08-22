import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    plugins: [react()],
    server: {
      host: "0.0.0.0",
      port: 5000,
      allowedHosts: true,
      proxy: env.BACKEND_URL ? { "/api": { target: env.BACKEND_URL, changeOrigin: true } } : undefined,
    },
  };
});