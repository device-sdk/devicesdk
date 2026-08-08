import { DeviceEntrypoint } from "@devicesdk/core";
import { NextionDisplay } from "@devicesdk/core/nextion";

// A dashboard for an ESP32 + Nextion serial HMI display.
//
// The Nextion panel runs a screen design created in the Nextion Editor (PC
// software from ITEAD) - pages, text components, numbers, images. Flash that
// design to the panel over serial or microSD first; this script only updates
// the components the design exposes, over UART.
//
// Wiring (standard ESP32 DevKit):
//   Nextion RX  ← ESP32 GPIO17 (UART2 TX)
//   Nextion TX  → ESP32 GPIO16 (UART2 RX)
//   Nextion VIN → 5V (external supply for bigger panels)
//   Nextion GND → common ground
//
// Expected design (page 0):
//   tTitle  - text component, shows the device status
//   tTime   - text component, shows the wall-clock time
//   tTemp   - text component, shows the onboard temperature
//   tUptime - text component, shows how long the device has been connected
//
// Touch events are NOT yet supported - receiving them needs an event-driven
// UART receive path on the firmware (planned, see the Phase 2 design doc in
// docs/designs/). Until it lands, reads from the panel must be polled.

// UART2 on the ESP32 DevKit (port 0 is the debug console).
const UART_PORT = 2;
const UART_TX = 17;
const UART_RX = 16;
// Must match the baud rate set in the Nextion Editor (default 9600).
const UART_BAUD = 115200;

const UPTIME_CRON = "*/5 * * * * *"; // every 5 seconds

export class DashboardDevice extends DeviceEntrypoint {
	// Uptime is cheap to compute, so refresh it frequently.
	crons = { uptime: UPTIME_CRON };

	private display = new NextionDisplay(this.env.DEVICE, {
		port: UART_PORT,
		txPin: UART_TX,
		rxPin: UART_RX,
		baudRate: UART_BAUD,
	});

	private connectedAt = Date.now();

	async onDeviceConnect() {
		console.info("Nextion dashboard connected");

		await this.display.connect();

		// Title + a fresh time/temperature frame so the screen is never blank.
		await this.display.setPage(0);
		await this.display.setText("tTitle", "DeviceSDK");
		await this.updateStats();
	}

	async onCron(name: string) {
		if (name === "uptime") await this.updateStats();
	}

	async onDeviceDisconnect() {
		console.info("Nextion dashboard disconnected");
	}

	private async updateStats() {
		const time = new Date().toLocaleTimeString("en-GB");
		const uptimeSec = Math.floor((Date.now() - this.connectedAt) / 1000);
		const uptime = `${Math.floor(uptimeSec / 60)}m ${uptimeSec % 60}s`;

		// The onboard temperature sensor is a cheap example value; replace this
		// with any data your script has (HTTP, sensors, other devices via RPC).
		// ASCII only: Nextion panels render their own font codepage, so the
		// UTF-8 degree sign (°) would show up as garbage on most panels.
		const temp = await this.env.DEVICE.getTemperature();
		const celsius =
			temp.type === "temperature_result" ? temp.payload.celsius : NaN;

		await this.display.setText("tTime", time);
		await this.display.setText("tTemp", `${celsius.toFixed(1)} C`);
		await this.display.setText("tUptime", uptime);
	}
}
