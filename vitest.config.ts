import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "."),
    },
  },
  test: {
    environment: "node",
    // Integration tests hit the real database and load the local embedding model
    // (a few seconds on first use in each worker).
    testTimeout: 30_000,
  },
});
