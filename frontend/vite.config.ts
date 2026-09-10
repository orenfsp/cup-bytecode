import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Для локальной разработки (npm run dev) проксируем API на Go-бэкенд.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": { target: "http://localhost:8080", ws: true },
      "/uploads": "http://localhost:8080",
    },
  },
});
