import { defineConfig } from "@devicesdk/cli";

export default defineConfig({
  projectId: "dummy",
  devices: {
    "device": {
      // main: "./src/devices/device.ts",
      main: "./src/devices/button.ts",
      entrypoint: "MyDevice",
      name: "Main Device",
      deviceType: 'pico2-w',
      wifi: {
        ssid: 'Nau',
        password: '12345679'
      }
    }
  },
});
