import { defineConfig } from "@devicesdk/cli";

export default defineConfig({
	projectId: "nextion-dashboard",
	devices: {
		dashboard: {
			className: "DashboardDevice",
			main: "./src/devices/dashboard.ts",
			deviceType: "esp32",
			name: "Nextion Dashboard",
			wifi: {
				ssid: "YOUR_WIFI_SSID",
				password: "YOUR_WIFI_PASSWORD",
			},
		},
	},
});
