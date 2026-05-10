import { defineConfig } from "@devicesdk/cli";

export default defineConfig({
  projectId: "example-basic",
  devices: {
    device: {
      main: "./src/devices/device.ts",
      className: "MyDevice",
      name: "Main Device",
      deviceType: "pico-w",
      wifi: {
        ssid: "YOUR_WIFI_SSID",
        password: "YOUR_WIFI_PASSWORD",
      },
    },
  },
});
