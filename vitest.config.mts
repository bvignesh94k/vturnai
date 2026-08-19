import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [tsconfigPaths()],
  resolve: {
    alias: {
      // Server-only modules are unit tested directly; the real import guard
      // still applies to the Next.js build.
      "server-only": fileURLToPath(new URL("./tests/stubs/server-only.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    globals: false,
    reporters: ["default"],
  },
});
