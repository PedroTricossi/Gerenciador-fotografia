/// <reference types="vitest/config" />
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Tests run west of UTC (no DST), so a local date that differs from the UTC date
// late in the evening is exercised even where the machine itself runs in UTC.
// Set before vitest starts its workers, which inherit it.
process.env.TZ = "America/Sao_Paulo";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    // The backend checks Origin against Host on writes. Keeping the browser's Host
    // (changeOrigin: false) makes `http://localhost:5173` match on both sides.
    proxy: {
      "/api": { target: "http://127.0.0.1:8000", changeOrigin: false },
    },
  },
  build: {
    // The backend's CSP is default-src 'self': no data: URLs, no inline scripts.
    assetsInlineLimit: 0,
    modulePreload: { polyfill: false },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test/localStorage.ts", "./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    css: { modules: { classNameStrategy: "non-scoped" } },
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/api/schema.d.ts",
        "src/main.tsx",
        "src/test/**",
        "src/**/*.test.{ts,tsx}",
        "src/vite-env.d.ts",
      ],
      thresholds: { lines: 80 },
    },
  },
});
