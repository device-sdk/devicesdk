import { defineConfig } from "@devicesdk/cli";

export default defineConfig({
	projectId: "esp32c3-clock",
	devices: {
		clock: {
			className: "ClockDevice",
			main: "./src/devices/clock.ts",
			deviceType: "esp32c3",
			name: "OLED Clock",
			wifi: {
				ssid: "YOUR_WIFI_SSID",
				password: "YOUR_WIFI_PASSWORD",
			},
		},
	},
});
