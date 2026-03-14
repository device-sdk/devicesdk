import { defineConfig } from "@devicesdk/cli";

export default defineConfig({
    projectId: "temperature-to-discord",
    devices: {
        temperatureSensor: {
            entrypoint: "TemperatureSensor",
            main: "./src/devices/temperatureSensor.ts",
            deviceType: "pico-w",
            name: "Temperature Sensor",
            wifi: {
                ssid: "YOUR_WIFI_SSID",
                password: "YOUR_WIFI_PASSWORD",
            },
        },
    },
});
