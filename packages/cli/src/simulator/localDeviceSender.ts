import type {
	DeviceCommand,
	DeviceResponse,
	DeviceSenderInterface,
	KVInterface,
} from "@devicesdk/core";

interface PendingCommand {
	resolve: (value: DeviceResponse) => void;
	reject: (reason?: unknown) => void;
	timeoutId: ReturnType<typeof setTimeout>;
}

export class LocalDeviceSender implements DeviceSenderInterface {
	private ws: WebSocket;
	private pendingCommands: Map<string, PendingCommand> = new Map();
	kv: KVInterface;

	constructor(ws: WebSocket, kvStorage: KVInterface) {
		this.ws = ws;
		this.kv = kvStorage;
	}

	handleResponse(message: DeviceResponse): boolean {
		const pending = this.pendingCommands.get(message.id);
		if (!pending) return false;

		clearTimeout(pending.timeoutId);
		this.pendingCommands.delete(message.id);

		if (message.type === "command_error") {
			pending.reject(new Error(`Device error: ${message.payload.error}`));
		} else {
			pending.resolve(message);
		}
		return true;
	}

	cleanup(): void {
		for (const [, pending] of this.pendingCommands) {
			clearTimeout(pending.timeoutId);
			pending.reject(new Error("Connection closed"));
		}
		this.pendingCommands.clear();
	}

	async sendCommand(command: Omit<DeviceCommand, "id">): Promise<void> {
		const fullCommand = {
			...command,
			id: crypto.randomUUID(),
		} as DeviceCommand;
		this.ws.send(JSON.stringify(fullCommand));
	}

	async sendCommandAndWait<T extends DeviceCommand>(
		command: Omit<T, "id">,
	): Promise<DeviceResponse> {
		const fullCommand = {
			...command,
			id: crypto.randomUUID(),
		} as DeviceCommand;

		return new Promise((resolve, reject) => {
			const timeoutId = setTimeout(() => {
				this.pendingCommands.delete(fullCommand.id);
				reject(
					new Error(
						`Timeout: No response for '${fullCommand.type}' (${fullCommand.id}) within 5s`,
					),
				);
			}, 5000);

			this.pendingCommands.set(fullCommand.id, {
				resolve,
				reject,
				timeoutId,
			});
			this.ws.send(JSON.stringify(fullCommand));
		});
	}

	async reboot(): Promise<void> {
		await this.sendCommand({ type: "reboot", payload: {} });
	}

	async setGpioState(pin: number, state: "high" | "low"): Promise<void> {
		await this.sendCommandAndWait({
			type: "set_gpio_state",
			payload: { pin, state },
		});
	}

	async setPwmState(
		pin: number,
		frequency: number,
		dutyCycle: number,
	): Promise<void> {
		await this.sendCommandAndWait({
			type: "set_pwm_state",
			payload: { pin, frequency, duty_cycle: dutyCycle },
		});
	}

	async getPinState(
		pin: number,
		mode: "analog" | "digital",
	): Promise<DeviceResponse> {
		return this.sendCommandAndWait({
			type: "get_pin_state",
			payload: { pin, mode },
		});
	}

	async i2cScan(bus: number): Promise<DeviceResponse> {
		return this.sendCommandAndWait({
			type: "i2c_scan",
			payload: { bus },
		});
	}

	async i2cWrite(
		bus: number,
		address: string,
		data: string[],
	): Promise<void> {
		await this.sendCommandAndWait({
			type: "i2c_write",
			payload: { bus, address, data },
		});
	}

	async i2cRead(
		bus: number,
		address: string,
		bytesToRead: number,
		registerToRead?: string,
	): Promise<DeviceResponse> {
		return this.sendCommandAndWait({
			type: "i2c_read",
			payload: {
				bus,
				address,
				bytes_to_read: bytesToRead,
				register_to_read: registerToRead,
			},
		});
	}

	async configureGpioInputMonitoring(
		pin: number,
		enable: boolean,
		pull?: "up" | "down" | "none",
	): Promise<void> {
		await this.sendCommandAndWait({
			type: "configure_gpio_input_monitoring",
			payload: { pin, enable, pull },
		});
	}
}
