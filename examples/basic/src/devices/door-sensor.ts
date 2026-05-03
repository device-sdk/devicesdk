import { DeviceEntrypoint, type DeviceResponse } from "@devicesdk/core";
import { SSD1306 } from "@devicesdk/core/i2c";

// Wiring:
//   GPIO 4 → one leg of the NC reed switch, other leg → GND.
//   Internal pull-up holds the line HIGH when the switch breaks (the typical
//   NC alarm convention: wire closed at rest, opens when the door opens).
//   If your sensor reads the other way, set INVERT_DOOR = true.
//
//   On-board 0.42" 72×40 SSD1306 on I²C bus 0: SDA=5, SCL=6, addr 0x3C, col offset 28.

const DOOR_PIN = 4;
const INVERT_DOOR = false;

const I2C_BUS = 0;
const I2C_SDA = 5;
const I2C_SCL = 6;
const OLED_WIDTH = 72;
const OLED_HEIGHT = 40;
const OLED_COL_OFFSET = 28;

const isDoorOpen = (pinHigh: boolean): boolean =>
	INVERT_DOOR ? !pinHigh : pinHigh;

const centerX = (text: string): number =>
	Math.max(0, Math.floor((OLED_WIDTH - (text.length * 6 - 1)) / 2));

export class MyDevice extends DeviceEntrypoint {
	private display = new SSD1306({
		bus: I2C_BUS,
		address: "0x3C",
		width: OLED_WIDTH,
		height: OLED_HEIGHT,
		columnOffset: OLED_COL_OFFSET,
	});

	async onDeviceConnect() {
		console.info("Door sensor connected");

		await this.env.DEVICE.kv.put("displayInitialized", false);

		await this.env.DEVICE.sendCommand({
			type: "i2c_configure",
			payload: {
				bus: I2C_BUS,
				sda_pin: I2C_SDA,
				scl_pin: I2C_SCL,
				frequency: 400000,
			},
		});

		await this.env.DEVICE.configureGpioInputMonitoring(DOOR_PIN, true, "up");

		// Firmware GPIO polling only emits on edges (worker_task.c:160 swallows
		// the first reading), so probe once for the initial level.
		const initial = await this.env.DEVICE.getPinState(DOOR_PIN, "digital");
		const high =
			initial.type === "pin_state_update" &&
			initial.payload.mode === "digital" &&
			initial.payload.value === "high";
		const open = isDoorOpen(high);
		await this.env.DEVICE.kv.put("doorOpen", open);
		console.info(`Initial door state: ${open ? "OPEN" : "CLOSED"}`);

		await this.updateDisplay();
	}

	async onDeviceDisconnect() {
		console.info("Door sensor disconnected");
	}

	async onMessage(message: DeviceResponse) {
		if (
			message.type !== "gpio_state_changed" ||
			message.payload.pin !== DOOR_PIN
		)
			return;

		const open = isDoorOpen(message.payload.state === "high");
		await this.env.DEVICE.kv.put("doorOpen", open);
		console.info(`Door ${open ? "OPENED" : "CLOSED"}`);
		await this.updateDisplay();
	}

	private async updateDisplay() {
		const open = (await this.env.DEVICE.kv.get<boolean>("doorOpen")) ?? false;
		const status = open ? "OPEN" : "CLOSED";

		this.display
			.clear()
			.drawText(centerX("DOOR"), 0, "DOOR")
			.drawLine(0, 10, OLED_WIDTH - 1, 10)
			.drawText(centerX(status), 17, status)
			.drawLine(0, 30, OLED_WIDTH - 1, 30)
			.drawText(centerX("GPIO 4"), 33, "GPIO 4");

		const initialized =
			(await this.env.DEVICE.kv.get<boolean>("displayInitialized")) ?? false;
		await this.env.DEVICE.sendCommand(
			this.display.toDisplayCommand({ init: !initialized, compress: false }),
		);
		if (!initialized) await this.env.DEVICE.kv.put("displayInitialized", true);
	}
}
