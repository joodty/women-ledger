import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
export default defineConfig({
  root: "frontend",
  plugins: [vue()],
  publicDir: "static",
  build: { outDir: "../dist/public", emptyOutDir: true, target: "es2020" },
  server: {
    host: "127.0.0.1",
    proxy: {
      "/api": "http://127.0.0.1:18763",
      "/app-version.json": "http://127.0.0.1:18763",
    },
  },
});
