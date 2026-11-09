import { defineConfig } from "vitest/config";

export default defineConfig({
  // The site is served from any path; assets are referenced relatively.
  base: "./",
  server: {
    // The WebAssembly package lives in core/wasm/pkg, outside web/.
    fs: { allow: [".."] },
  },
  build: {
    target: "es2022",
  },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
});
