import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Pure logic by default; component specs opt into jsdom with a docblock.
    environment: "node",
    include: ["**/*.test.{ts,tsx}"],
    exclude: ["node_modules", ".next"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, ".") },
  },
});
