import { defineConfig } from "@devicesdk/cli";

export default defineConfig({
  projectId: "dummy",
  devices: {
    "device": {
      // main: "./src/devices/device.ts",
      // main: "./src/devices/button.ts",
      main: "./src/devices/door-sensor.ts",
      className: "MyDevice",
      name: "Main Device",
      //deviceType: 'pico2-w',
      deviceType: 'esp32c3',
      wifi: {
        ssid: 'Nau',
        password: '12345679'
      }
    }
  },
});
