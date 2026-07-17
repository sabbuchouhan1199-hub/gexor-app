import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const apiTarget =
  process.env.VITE_API_TARGET ?? "http://127.0.0.1:3001";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    proxy: {
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
