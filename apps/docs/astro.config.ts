import { defineConfig } from "astro/config";
import icon from "astro-icon";
import tailwindcss from "@tailwindcss/vite";
import nimbus, { defineConfig as defineNimbusConfig } from "@cloudflare/nimbus-docs";
import { tableScroll } from "@cloudflare/nimbus-docs/markdown";

const nimbusConfig = defineNimbusConfig({
  site: "https://docs.devicesdk.com",
  title: "DeviceSDK",
  description:
    "Free, open-source, self-hosted IoT platform. Write TypeScript device scripts, run the server on your own hardware, and connect ESP32 and Raspberry Pi Pico devices over WebSocket.",
  locale: "en",
  github: "https://github.com/device-sdk/devicesdk",
  editPattern: "https://github.com/device-sdk/devicesdk/edit/main/apps/docs/{path}",
  socialImageAlt: "DeviceSDK documentation preview",
  sidebar: {
    items: [
      "index",
      "quickstart",
      "first-device",
      { label: "CLI", autogenerate: { directory: "cli" } },
      { label: "Concepts", autogenerate: { directory: "concepts" } },
      { label: "Guides", autogenerate: { directory: "guides" } },
      { label: "Recipes", autogenerate: { directory: "recipes" } },
      { label: "Hardware", autogenerate: { directory: "hardware" } },
      "mcp",
      { label: "Errors", autogenerate: { directory: "errors" } },
      "changelog",
      { label: "Resources", autogenerate: { directory: "resources" } },
    ],
  },
});

export default defineConfig({
  output: "static",
  vite: {
    plugins: [tailwindcss()],
  },
  prefetch: {
    prefetchAll: true,
    defaultStrategy: "hover",
  },
  integrations: [
    icon(),
    nimbus(nimbusConfig, {
      rules: {
        "nimbus/frontmatter-shape": "error",
        "nimbus/internal-link": "error",
      },
      markdown: {
        hastPlugins: [tableScroll()],
      },
    }),
  ],
});
