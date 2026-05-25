import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@defs": fileURLToPath(new URL("./src/defs/index.ts", import.meta.url)),
      "@sdk/server-types": fileURLToPath(new URL("./src/__generated__/server-types.d.ts", import.meta.url)),
    },
  },
  test: { globals: true, environment: "node" },
});
