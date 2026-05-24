// --- Device Responses ---
interface BaseResponse {
	id: string; // Should match the ID of the command it's responding to.
}

export interface DeviceConnected extends BaseResponse {
	type: "device_connected";
}

// Discriminated by `payload.mode` so the value type is precise per mode:
// digital reads return "high" | "low" (matching the firmware's natural shape),
// analog reads return a numeric ADC value.
export type PinStateUpdate =
	| (BaseResponse & {
			type: "pin_state_update";
			payload: {
				pin: number;
				mode: "digital";
				value: "high" | "low";
			};
	  })
	| (BaseResponse & {
			type: "pin_state_update";
			payload: {
				pin: number;
				mode: "analog";
				value: number;
			};
	  });

export interface I2cScanResult extends BaseResponse {
	type: "i2c_scan_result";
	payload: {
		bus: number;
		addresses_found: string[];
	};
}

export interface I2cReadResult extends BaseResponse {
	type: "i2c_read_result";
	payload: {
		bus: number;
		address: string;
		data: string[];
	};
}

export interface CommandAck extends BaseResponse {
	type: "command_ack";
	payload: {
		command_type: string;
	};
}

export interface CommandError extends BaseResponse {
	type: "command_error";
	payload: {
		command_type: string;
		error: string;
	};
}

export interface GpioStateChanged extends BaseResponse {
	type: "gpio_state_changed";
	payload: {
		pin: number;
		state: "high" | "low";
	};
}

export interface TemperatureResult extends BaseResponse {
	type: "temperature_result";
	payload: {
		celsius: number;
	};
}

export interface SpiTransferResult extends BaseResponse {
	type: "spi_transfer_result";
	payload: {
		bus: number;
		data: string[];
	};
}

export interface SpiReadResult extends BaseResponse {
	type: "spi_read_result";
	payload: {
		bus: number;
		data: string[];
	};
}

export interface UartReadResult extends BaseResponse {
	type: "uart_read_result";
	payload: {
		port: number;
		data: string[];
		bytes_read: number;
	};
}

export type DeviceResponse =
	| DeviceConnected
	| PinStateUpdate
	| I2cScanResult
	| I2cReadResult
	| CommandAck
	| CommandError
	| GpioStateChanged
	| TemperatureResult
	| SpiTransferResult
	| SpiReadResult
	| UartReadResult;

// --- Command to Response Mapping ---
export type CommandResponseTypeMap = {
	reboot: CommandAck;
	set_gpio_state: CommandAck;
	set_pwm_state: CommandAck;
	set_pin_config: CommandAck;
	get_pin_state: PinStateUpdate;
	i2c_configure: CommandAck;
	i2c_scan: I2cScanResult;
	i2c_write: CommandAck;
	i2c_read: I2cReadResult;
	i2c_batch_write: CommandAck;
	display_update: CommandAck;
	configure_gpio_input_monitoring: CommandAck;
	get_temperature: TemperatureResult;
	watchdog_configure: CommandAck;
	watchdog_feed: CommandAck;
	spi_configure: CommandAck;
	spi_transfer: SpiTransferResult;
	spi_write: CommandAck;
	spi_read: SpiReadResult;
	uart_configure: CommandAck;
	uart_write: CommandAck;
	uart_read: UartReadResult;
	pio_ws2812_configure: CommandAck;
	pio_ws2812_update: CommandAck;
};
