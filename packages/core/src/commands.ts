// --- Generic Command Structure ---
export interface Command<T extends string, P> {
	id: string;
	type: T;
	payload: P;
}

// --- GPIO Commands ---
export type SetGpioStateCommand = Command<
	"set_gpio_state",
	{
		pin: number;
		state: "high" | "low";
	}
>;

// --- PWM Commands ---
export type SetPwmStateCommand = Command<
	"set_pwm_state",
	{
		pin: number;
		frequency: number;
		duty_cycle: number;
	}
>;

// --- Pin Monitoring Commands ---
export type SetPinConfigCommand = Command<
	"set_pin_config",
	{
		pin: number;
		mode: "analog" | "digital";
		report_policy: "interval" | "on_change";
		report_interval_ms?: number;
		report_change_threshold_percent?: number;
	}
>;

export type GetPinStateCommand = Command<
	"get_pin_state",
	{
		pin: number;
		mode: "analog" | "digital";
	}
>;

// --- I2C Commands ---
export type I2cScanCommand = Command<
	"i2c_scan",
	{
		bus: number;
	}
>;

export type I2cWriteCommand = Command<
	"i2c_write",
	{
		bus: number;
		address: string;
		data: string[];
	}
>;

export type I2cReadCommand = Command<
	"i2c_read",
	{
		bus: number;
		address: string;
		register_to_read?: string;
		bytes_to_read: number;
	}
>;

// --- I2C Configuration Command ---
export type I2cConfigureCommand = Command<
	"i2c_configure",
	{
		bus: number;
		sda_pin: number;
		scl_pin: number;
		frequency?: number;
	}
>;

// --- I2C Batch Commands (for reducing round-trips) ---
export type I2cBatchWriteCommand = Command<
	"i2c_batch_write",
	{
		bus: number;
		address: string;
		writes: string[][];
	}
>;

// --- Display Commands (optimized for large framebuffers) ---
export type DisplayController = "ssd1306" | "sh1106";

export interface DisplaySegment {
	offset: number;
	data: string; // base64
}

export type DisplayUpdateCommand = Command<
	"display_update",
	{
		bus: number;
		address: string;
		controller: DisplayController;
		width: number;
		height: number;
		// Columns 0..width-1 in the framebuffer map to columnOffset..columnOffset+width-1 in
		// controller RAM. Needed for glass sizes where the visible window is not at column 0
		// (e.g. the 0.42" 72x40 SSD1306 boards, which sit at column offset 28 on most FN4
		// boards — 30 and 32 also exist).
		columnOffset?: number;
		pageOffset?: number;
		init?: boolean;
		segments: DisplaySegment[];
	}
>;

// --- GPIO Input Monitoring Commands ---
export type ConfigureGpioInputMonitoringCommand = Command<
	"configure_gpio_input_monitoring",
	{
		pin: number;
		enable: boolean;
		pull?: "up" | "down" | "none";
	}
>;

// --- Temperature Sensor Commands ---
export type GetTemperatureCommand = Command<
	"get_temperature",
	Record<string, never>
>;

// --- Watchdog Commands ---
export type WatchdogConfigureCommand = Command<
	"watchdog_configure",
	{
		timeout_ms: number;
		enable: boolean;
	}
>;

export type WatchdogFeedCommand = Command<
	"watchdog_feed",
	Record<string, never>
>;

// --- SPI Commands ---
export type SpiConfigureCommand = Command<
	"spi_configure",
	{
		bus: number;
		clk_pin: number;
		mosi_pin: number;
		miso_pin: number;
		cs_pin: number;
		frequency: number;
		mode: 0 | 1 | 2 | 3;
	}
>;

export type SpiTransferCommand = Command<
	"spi_transfer",
	{
		bus: number;
		data: string[];
	}
>;

export type SpiWriteCommand = Command<
	"spi_write",
	{
		bus: number;
		data: string[];
	}
>;

export type SpiReadCommand = Command<
	"spi_read",
	{
		bus: number;
		bytes_to_read: number;
	}
>;

// --- UART Commands ---
export type UartConfigureCommand = Command<
	"uart_configure",
	{
		port: number;
		tx_pin: number;
		rx_pin: number;
		baud_rate: number;
		data_bits?: 5 | 6 | 7 | 8;
		stop_bits?: 1 | 2;
		parity?: "none" | "even" | "odd";
	}
>;

export type UartWriteCommand = Command<
	"uart_write",
	{
		port: number;
		data: string[];
	}
>;

export type UartReadCommand = Command<
	"uart_read",
	{
		port: number;
		bytes_to_read: number;
		timeout_ms?: number;
	}
>;

// --- PIO Commands (Pico only) ---
export type PioWs2812ConfigureCommand = Command<
	"pio_ws2812_configure",
	{
		pin: number;
		num_leds: number;
	}
>;

export type PioWs2812UpdateCommand = Command<
	"pio_ws2812_update",
	{
		pixels: [number, number, number][];
	}
>;

// --- Device Commands ---
export type RebootCommand = Command<"reboot", Record<string, never>>;

// --- Union of all possible commands ---
export type DeviceCommand =
	| SetGpioStateCommand
	| SetPwmStateCommand
	| SetPinConfigCommand
	| GetPinStateCommand
	| I2cConfigureCommand
	| I2cScanCommand
	| I2cWriteCommand
	| I2cReadCommand
	| I2cBatchWriteCommand
	| DisplayUpdateCommand
	| RebootCommand
	| ConfigureGpioInputMonitoringCommand
	| GetTemperatureCommand
	| WatchdogConfigureCommand
	| WatchdogFeedCommand
	| SpiConfigureCommand
	| SpiTransferCommand
	| SpiWriteCommand
	| SpiReadCommand
	| UartConfigureCommand
	| UartWriteCommand
	| UartReadCommand
	| PioWs2812ConfigureCommand
	| PioWs2812UpdateCommand;
