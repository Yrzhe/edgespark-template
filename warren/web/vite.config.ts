import path from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [tailwindcss(), react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks: {
          i18n: ["i18next", "react-i18next"],
          vendor: ["react", "react-dom"],
        },
      },
    },
  },
  server: {
    port: 5176,
    proxy: {
      "/api": "http://localhost:8787",
    },
  },
});
