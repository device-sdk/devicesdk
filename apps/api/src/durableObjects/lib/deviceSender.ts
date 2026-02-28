import { WorkerEntrypoint } from "cloudflare:workers";
import type { DeviceCommand, DeviceResponse } from "@devicesdk/core";
import type { BaseDevice } from "./device";
import type { DeviceSenderProps, KVInterface } from "./userWorkerTypes";

// WorkerEntrypoint that is provided to the dynamic worker as a binding
// This allows user code to send commands back to the IoT device
export class DeviceSender extends WorkerEntrypoint<
	{ DEVICE: DurableObjectNamespace<BaseDevice> },
	DeviceSenderProps
> {
	private _kv?: KVInterface;

	getDoStub() {
		const doName = `${this.ctx.props.projectId}:${this.ctx.props.deviceId}`;
		const durableObjectId = this.env.DEVICE.idFromName(doName);
		return this.env.DEVICE.get(durableObjectId);
	}

	get kv(): KVInterface {
		if (!this._kv) {
			const stub = this.getDoStub();
			this._kv = {
				// get: <T = unknown>(key: string) => stub.kvGet<T>(key), todo: fix this
				get: <T = unknown>(key: string) => stub.kvGet(key),
				put: <T>(key: string, value: T) => stub.kvPut(key, value),
				delete: (key: string) => stub.kvDelete(key),
			};
		}
		return this._kv;
	}

	async sendCommand(command: Omit<DeviceCommand, "id">): Promise<void> {
		const fullCommand: DeviceCommand = {
			...command,
			id: crypto.randomUUID(),
		} as DeviceCommand;
		// Call method on the DO stub
		return this.getDoStub().sendCommandWithoutAck(fullCommand);
	}

	async sendCommandAndWait(
		command: Omit<DeviceCommand, "id">,
	): Promise<DeviceResponse> {
		const fullCommand: DeviceCommand = {
			...command,
			id: crypto.randomUUID(),
		} as DeviceCommand;
		// Call method on the DO stub
		return this.getDoStub().sendCommandAndWaitForResponse(fullCommand);
	}

	async reboot(): Promise<void> {
		await this.sendCommand({ type: "reboot", payload: {} });
	}

	async setGpioState(pin: number, state: "high" | "low"): Promise<void> {
		await this.sendCommand({
			type: "set_gpio_state",
			payload: { pin, state },
		});
	}

	async setPwmState(
		pin: number,
		frequency: number,
		dutyCycle: number,
	): Promise<void> {
		await this.sendCommand({
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

	async i2cWrite(bus: number, address: string, data: string[]): Promise<void> {
		await this.sendCommand({
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
		pull: "up" | "down" | "none" = "up",
	): Promise<void> {
		await this.sendCommand({
			type: "configure_gpio_input_monitoring",
			payload: { pin, enable, pull },
		});
	}

	async persistLog(level: string, message: string): Promise<void> {
		await this.getDoStub().persistLog(level, message);
	}
}
