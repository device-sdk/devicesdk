import vue from "@vitejs/plugin-vue";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { defineConfig } from "vitest/config";

const require = createRequire(import.meta.url);
const dir = fileURLToPath(new URL(".", import.meta.url));

// Resolve quasar's client build explicitly because vitest (running in Node)
// resolves the "node" export condition which points to the server build,
// and the server build crashes inside jsdom.
const quasarClientPath = require
  .resolve("quasar/package.json")
  .replace("package.json", "dist/quasar.client.js");

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("../../src", import.meta.url)),
      quasar: quasarClientPath,
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    root: dir,
    setupFiles: ["./setup.ts"],
    include: ["**/*.spec.ts"],
  },
});
