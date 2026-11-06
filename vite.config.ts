import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, strictPort: true, proxy: { "/api": "http://127.0.0.1:5178" } },
  test: { include: ["tests/**/*.test.ts"], environment: "node" },
} as never);
