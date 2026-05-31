import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@defs": fileURLToPath(new URL("./src/defs/index.ts", import.meta.url)),
      "edgespark/http": fileURLToPath(new URL("./test/edgeHttpMock.ts", import.meta.url)),
      edgespark: fileURLToPath(new URL("./test/edgeMock.ts", import.meta.url)),
    },
  },
  test: { globals: true, environment: "node" },
});
