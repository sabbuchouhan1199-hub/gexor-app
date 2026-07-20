import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const apiTarget =
  process.env.VITE_API_TARGET ?? "http://127.0.0.1:3001";

export default defineConfig({
  resolve: {
    alias: {
      "@gexor/contracts": path.resolve(__dirname, "../../packages/contracts/src/index.ts"),
    },
  },
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": { target: apiTarget, changeOrigin: true },
      "/mock": {
        target: apiTarget,
        changeOrigin: true,
      },
      "/chat": {
        target: apiTarget,
        changeOrigin: true,
      },
    },
  },
});
