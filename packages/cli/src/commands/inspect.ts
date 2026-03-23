import * as readline from "node:readline";
import {
	type DeviceCommandRequest,
	type DeviceCommandResponse,
	DeviceSDKApiError,
	sendDeviceCommand,
} from "../api.js";
import { requireAuth } from "../credentials.js";
import { loadConfig } from "../utils.js";

interface InspectOptions {
	project?: string;
	config?: string;
}

export interface ParseResult {
	command: DeviceCommandRequest;
	error?: never;
}

export interface ParseError {
	command?: never;
	error: string;
}

/**
 * Parses a REPL input line into a DeviceCommandRequest.
 * Returns { command } on success, { error } on failure.
 */
export function parseCommand(input: string): ParseResult | ParseError {
	const parts = input.trim().split(/\s+/);
	if (parts.length === 0 || parts[0] === "") {
		return { error: "Empty input" };
	}

	const cmd = parts[0].toLowerCase();

	// gpio read <pin>
	if (cmd === "gpio" && parts[1] === "read") {
		const pin = parseInt(parts[2], 10);
		if (Number.isNaN(pin)) return { error: `Invalid pin number: ${parts[2]}` };
		return {
			command: { type: "get_pin_state", payload: { pin, mode: "digital" } },
		};
	}

	// gpio write <pin> high|low
	if (cmd === "gpio" && parts[1] === "write") {
		const pin = parseInt(parts[2], 10);
		if (Number.isNaN(pin)) return { error: `Invalid pin number: ${parts[2]}` };
		const state = parts[3]?.toLowerCase();
		if (state !== "high" && state !== "low") {
			return {
				error: `Invalid state: "${parts[3]}" — must be "high" or "low"`,
			};
		}
		return {
			command: { type: "set_gpio_state", payload: { pin, state } },
		};
	}

	// adc read <pin>
	if (cmd === "adc" && parts[1] === "read") {
		const pin = parseInt(parts[2], 10);
		if (Number.isNaN(pin)) return { error: `Invalid pin number: ${parts[2]}` };
		return {
			command: { type: "get_pin_state", payload: { pin, mode: "analog" } },
		};
	}

	// pwm <pin> <frequency> <duty_cycle>
	if (cmd === "pwm") {
		const pin = parseInt(parts[1], 10);
		const frequency = parseInt(parts[2], 10);
		const duty_cycle = parseFloat(parts[3]);
		if (Number.isNaN(pin)) return { error: `Invalid pin number: ${parts[1]}` };
		if (Number.isNaN(frequency))
			return { error: `Invalid frequency: ${parts[2]}` };
		if (Number.isNaN(duty_cycle))
			return { error: `Invalid duty cycle: ${parts[3]}` };
		return {
			command: {
				type: "set_pwm_state",
				payload: { pin, frequency, duty_cycle },
			},
		};
	}

	// i2c scan [bus]
	if (cmd === "i2c" && parts[1] === "scan") {
		const bus = parts[2] !== undefined ? parseInt(parts[2], 10) : 0;
		if (Number.isNaN(bus)) return { error: `Invalid bus number: ${parts[2]}` };
		return {
			command: { type: "i2c_scan", payload: { bus } },
		};
	}

	// i2c configure <bus> <sda> <scl> [freq]
	if (cmd === "i2c" && parts[1] === "configure") {
		const bus = parseInt(parts[2], 10);
		const sda_pin = parseInt(parts[3], 10);
		const scl_pin = parseInt(parts[4], 10);
		if (Number.isNaN(bus)) return { error: `Invalid bus number: ${parts[2]}` };
		if (Number.isNaN(sda_pin)) return { error: `Invalid SDA pin: ${parts[3]}` };
		if (Number.isNaN(scl_pin)) return { error: `Invalid SCL pin: ${parts[4]}` };
		const payload: Record<string, unknown> = { bus, sda_pin, scl_pin };
		if (parts[5] !== undefined) {
			const frequency = parseInt(parts[5], 10);
			if (Number.isNaN(frequency))
				return { error: `Invalid frequency: ${parts[5]}` };
			payload.frequency = frequency;
		}
		return { command: { type: "i2c_configure", payload } };
	}

	// i2c read <bus> <addr> <bytes> [register]
	if (cmd === "i2c" && parts[1] === "read") {
		const bus = parseInt(parts[2], 10);
		const address = parts[3];
		const bytes_to_read = parseInt(parts[4], 10);
		if (Number.isNaN(bus)) return { error: `Invalid bus number: ${parts[2]}` };
		if (!address) return { error: "Missing I2C address" };
		if (Number.isNaN(bytes_to_read))
			return { error: `Invalid byte count: ${parts[4]}` };
		const payload: Record<string, unknown> = { bus, address, bytes_to_read };
		if (parts[5] !== undefined) {
			payload.register_to_read = parts[5];
		}
		return { command: { type: "i2c_read", payload } };
	}

	// i2c write <bus> <addr> <data...>
	if (cmd === "i2c" && parts[1] === "write") {
		const bus = parseInt(parts[2], 10);
		const address = parts[3];
		if (Number.isNaN(bus)) return { error: `Invalid bus number: ${parts[2]}` };
		if (!address) return { error: "Missing I2C address" };
		const data = parts.slice(4);
		if (data.length === 0) return { error: "Missing data bytes to write" };
		return {
			command: { type: "i2c_write", payload: { bus, address, data } },
		};
	}

	// monitor <pin> [pull]
	if (cmd === "monitor") {
		const pin = parseInt(parts[1], 10);
		if (Number.isNaN(pin)) return { error: `Invalid pin number: ${parts[1]}` };
		const payload: Record<string, unknown> = { pin, enable: true };
		if (parts[2] !== undefined) {
			const pull = parts[2].toLowerCase();
			if (pull !== "up" && pull !== "down" && pull !== "none") {
				return {
					error: `Invalid pull mode: "${parts[2]}" — must be "up", "down", or "none"`,
				};
			}
			payload.pull = pull;
		}
		return { command: { type: "configure_gpio_input_monitoring", payload } };
	}

	// reboot
	if (cmd === "reboot") {
		return { command: { type: "reboot", payload: {} } };
	}

	// temperature (or temp)
	if (cmd === "temperature" || cmd === "temp") {
		return { command: { type: "get_temperature", payload: {} } };
	}

	// watchdog configure <timeout_ms> [disable]
	if (cmd === "watchdog" && parts[1] === "configure") {
		const timeout_ms = parseInt(parts[2], 10);
		if (Number.isNaN(timeout_ms))
			return { error: `Invalid timeout: ${parts[2]}` };
		const enable = parts[3] !== "disable";
		return {
			command: {
				type: "watchdog_configure",
				payload: { timeout_ms, enable },
			},
		};
	}

	// watchdog feed
	if (cmd === "watchdog" && parts[1] === "feed") {
		return { command: { type: "watchdog_feed", payload: {} } };
	}

	// spi configure <bus> <clk> <mosi> <miso> <cs> <freq> [mode]
	if (cmd === "spi" && parts[1] === "configure") {
		const bus = parseInt(parts[2], 10);
		const clk_pin = parseInt(parts[3], 10);
		const mosi_pin = parseInt(parts[4], 10);
		const miso_pin = parseInt(parts[5], 10);
		const cs_pin = parseInt(parts[6], 10);
		const frequency = parseInt(parts[7], 10);
		if (Number.isNaN(bus)) return { error: `Invalid bus number: ${parts[2]}` };
		if (Number.isNaN(clk_pin)) return { error: `Invalid CLK pin: ${parts[3]}` };
		if (Number.isNaN(mosi_pin))
			return { error: `Invalid MOSI pin: ${parts[4]}` };
		if (Number.isNaN(miso_pin))
			return { error: `Invalid MISO pin: ${parts[5]}` };
		if (Number.isNaN(cs_pin)) return { error: `Invalid CS pin: ${parts[6]}` };
		if (Number.isNaN(frequency))
			return { error: `Invalid frequency: ${parts[7]}` };
		const mode = parts[8] !== undefined ? parseInt(parts[8], 10) : 0;
		return {
			command: {
				type: "spi_configure",
				payload: { bus, clk_pin, mosi_pin, miso_pin, cs_pin, frequency, mode },
			},
		};
	}

	// spi transfer <bus> <hex_bytes...>
	if (cmd === "spi" && parts[1] === "transfer") {
		const bus = parseInt(parts[2], 10);
		if (Number.isNaN(bus)) return { error: `Invalid bus number: ${parts[2]}` };
		const data = parts.slice(3);
		if (data.length === 0) return { error: "Missing data bytes" };
		return {
			command: { type: "spi_transfer", payload: { bus, data } },
		};
	}

	// spi write <bus> <hex_bytes...>
	if (cmd === "spi" && parts[1] === "write") {
		const bus = parseInt(parts[2], 10);
		if (Number.isNaN(bus)) return { error: `Invalid bus number: ${parts[2]}` };
		const data = parts.slice(3);
		if (data.length === 0) return { error: "Missing data bytes" };
		return {
			command: { type: "spi_write", payload: { bus, data } },
		};
	}

	// spi read <bus> <bytes>
	if (cmd === "spi" && parts[1] === "read") {
		const bus = parseInt(parts[2], 10);
		const bytes_to_read = parseInt(parts[3], 10);
		if (Number.isNaN(bus)) return { error: `Invalid bus number: ${parts[2]}` };
		if (Number.isNaN(bytes_to_read))
			return { error: `Invalid byte count: ${parts[3]}` };
		return {
			command: { type: "spi_read", payload: { bus, bytes_to_read } },
		};
	}

	// uart configure <port> <tx> <rx> <baud> [data_bits] [stop_bits] [parity]
	if (cmd === "uart" && parts[1] === "configure") {
		const port = parseInt(parts[2], 10);
		const tx_pin = parseInt(parts[3], 10);
		const rx_pin = parseInt(parts[4], 10);
		const baud_rate = parseInt(parts[5], 10);
		if (Number.isNaN(port)) return { error: `Invalid port: ${parts[2]}` };
		if (Number.isNaN(tx_pin)) return { error: `Invalid TX pin: ${parts[3]}` };
		if (Number.isNaN(rx_pin)) return { error: `Invalid RX pin: ${parts[4]}` };
		if (Number.isNaN(baud_rate))
			return { error: `Invalid baud rate: ${parts[5]}` };
		const payload: Record<string, unknown> = {
			port,
			tx_pin,
			rx_pin,
			baud_rate,
		};
		if (parts[6] !== undefined) payload.data_bits = parseInt(parts[6], 10);
		if (parts[7] !== undefined) payload.stop_bits = parseInt(parts[7], 10);
		if (parts[8] !== undefined) payload.parity = parts[8];
		return { command: { type: "uart_configure", payload } };
	}

	// uart write <port> <hex_bytes...>
	if (cmd === "uart" && parts[1] === "write") {
		const port = parseInt(parts[2], 10);
		if (Number.isNaN(port)) return { error: `Invalid port: ${parts[2]}` };
		const data = parts.slice(3);
		if (data.length === 0) return { error: "Missing data bytes" };
		return {
			command: { type: "uart_write", payload: { port, data } },
		};
	}

	// uart read <port> <bytes> [timeout_ms]
	if (cmd === "uart" && parts[1] === "read") {
		const port = parseInt(parts[2], 10);
		const bytes_to_read = parseInt(parts[3], 10);
		if (Number.isNaN(port)) return { error: `Invalid port: ${parts[2]}` };
		if (Number.isNaN(bytes_to_read))
			return { error: `Invalid byte count: ${parts[3]}` };
		const payload: Record<string, unknown> = { port, bytes_to_read };
		if (parts[4] !== undefined) {
			const timeout_ms = parseInt(parts[4], 10);
			if (Number.isNaN(timeout_ms))
				return { error: `Invalid timeout: ${parts[4]}` };
			payload.timeout_ms = timeout_ms;
		}
		return { command: { type: "uart_read", payload } };
	}

	// ws2812 configure <pin> <num_leds>
	if (cmd === "ws2812" && parts[1] === "configure") {
		const pin = parseInt(parts[2], 10);
		const num_leds = parseInt(parts[3], 10);
		if (Number.isNaN(pin)) return { error: `Invalid pin: ${parts[2]}` };
		if (Number.isNaN(num_leds))
			return { error: `Invalid LED count: ${parts[3]}` };
		return {
			command: { type: "pio_ws2812_configure", payload: { pin, num_leds } },
		};
	}

	// ws2812 fill <r> <g> <b> <num_leds>
	if (cmd === "ws2812" && parts[1] === "fill") {
		const r = parseInt(parts[2], 10);
		const g = parseInt(parts[3], 10);
		const b = parseInt(parts[4], 10);
		const num = parseInt(parts[5], 10);
		if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b))
			return { error: "Invalid RGB values" };
		if (Number.isNaN(num)) return { error: `Invalid LED count: ${parts[5]}` };
		const pixels: [number, number, number][] = Array.from(
			{ length: num },
			() => [r, g, b],
		);
		return {
			command: { type: "pio_ws2812_update", payload: { pixels } },
		};
	}

	return {
		error: `Unknown command: "${cmd}". Type "help" to see available commands.`,
	};
}

/**
 * Formats a device response for terminal display.
 */
export function formatResponse(response: DeviceCommandResponse): string {
	const { type, payload } = response;

	if (type === "pin_state_update") {
		const p = payload as { pin: number; mode: string; value: number };
		if (p.mode === "analog") {
			return `Pin ${p.pin} (analog): ${p.value}`;
		}
		return `Pin ${p.pin}: ${p.value === 1 ? "HIGH" : "LOW"}`;
	}

	if (type === "i2c_scan_result") {
		const p = payload as { bus: number; addresses_found: string[] };
		if (p.addresses_found.length === 0) {
			return `No I2C devices found on bus ${p.bus}`;
		}
		return `Found ${p.addresses_found.length} device(s) on bus ${p.bus}: ${p.addresses_found.join(", ")}`;
	}

	if (type === "i2c_read_result") {
		const p = payload as { bus: number; address: string; data: string[] };
		return `Read from ${p.address}: [${p.data.join(", ")}]`;
	}

	if (type === "temperature_result") {
		const p = payload as { celsius: number };
		return `Temperature: ${p.celsius.toFixed(1)}°C`;
	}

	if (type === "spi_transfer_result") {
		const p = payload as { bus: number; data: string[] };
		return `SPI transfer on bus ${p.bus}: [${p.data.join(", ")}]`;
	}

	if (type === "spi_read_result") {
		const p = payload as { bus: number; data: string[] };
		return `SPI read from bus ${p.bus}: [${p.data.join(", ")}]`;
	}

	if (type === "uart_read_result") {
		const p = payload as { port: number; data: string[]; bytes_read: number };
		return `UART port ${p.port} read ${p.bytes_read} bytes: [${p.data.join(", ")}]`;
	}

	if (type === "command_ack") {
		return "OK";
	}

	if (type === "command_error") {
		const p = payload as { error: string };
		return `\x1b[31mError: ${p.error}\x1b[0m`;
	}

	// Fallback: show raw JSON
	return JSON.stringify(payload, null, 2);
}

function printHelp(): void {
	console.log(`
Available commands:
  gpio read <pin>                         Read digital pin state
  gpio write <pin> high|low               Set GPIO output state
  adc read <pin>                          Read analog pin value
  pwm <pin> <frequency> <duty_cycle>      Set PWM output
  i2c scan [bus]                          Scan for I2C devices (default bus 0)
  i2c configure <bus> <sda> <scl> [freq]  Configure I2C bus pins
  i2c read <bus> <addr> <bytes> [reg]     Read bytes from I2C device
  i2c write <bus> <addr> <data...>        Write bytes to I2C device
  monitor <pin> [up|down|none]            Enable GPIO input monitoring
  temperature (or temp)                   Read on-die temperature sensor
  watchdog configure <ms> [disable]       Set watchdog timeout (ms)
  watchdog feed                           Feed the watchdog timer
  spi configure <bus> <clk> <mosi> <miso> <cs> <freq> [mode]
                                          Configure SPI bus
  spi transfer <bus> <hex_bytes...>       Full-duplex SPI transfer
  spi write <bus> <hex_bytes...>          SPI write
  spi read <bus> <bytes>                  SPI read
  uart configure <port> <tx> <rx> <baud> [data_bits] [stop_bits] [parity]
                                          Configure UART port
  uart write <port> <hex_bytes...>        Write to UART
  uart read <port> <bytes> [timeout_ms]   Read from UART
  ws2812 configure <pin> <num_leds>       Configure WS2812 LED strip (Pico)
  ws2812 fill <r> <g> <b> <num_leds>     Fill all LEDs with color
  reboot                                  Reboot the device
  help                                    Show this help
  exit / Ctrl-C                           Exit inspect mode
`);
}

export default async function inspect(
	deviceId: string,
	options: InspectOptions,
): Promise<void> {
	try {
		const token = await requireAuth();

		// Resolve project ID
		let projectId: string;
		if (options.project) {
			projectId = options.project;
		} else {
			const config = await loadConfig(options.config);
			projectId = config.projectId;
		}

		console.log(
			`Connecting to device "${deviceId}" in project "${projectId}"...`,
		);
		console.log('Type "help" for available commands, "exit" to quit.\n');

		const rl = readline.createInterface({
			input: process.stdin,
			output: process.stdout,
			terminal: true,
			prompt: `devicesdk:${deviceId}> `,
		});

		rl.prompt();

		// Serial queue — ensures commands don't interleave on piped input
		let commandQueue: Promise<void> = Promise.resolve();

		rl.on("line", (line) => {
			commandQueue = commandQueue.then(async () => {
				const input = line.trim();

				if (!input) {
					rl.prompt();
					return;
				}

				if (input === "exit" || input === "quit") {
					rl.close(); // 'close' event handler logs "Goodbye." and calls process.exit(0)
					return;
				}

				if (input === "help") {
					printHelp();
					rl.prompt();
					return;
				}

				const parsed = parseCommand(input);

				if ("error" in parsed) {
					console.error(`\x1b[33m${parsed.error}\x1b[0m`);
					rl.prompt();
					return;
				}

				// Confirm reboot to avoid accidental reboots
				if (parsed.command.type === "reboot") {
					rl.question("Reboot the device? [y/N] ", async (answer) => {
						if (answer.toLowerCase() !== "y") {
							console.log("Aborted.");
							rl.prompt();
							return;
						}
						await executeCommand(
							token,
							projectId,
							deviceId,
							parsed.command,
							rl,
						);
					});
					return;
				}

				await executeCommand(token, projectId, deviceId, parsed.command, rl);
			});
		});

		rl.on("close", () => {
			console.log("\nGoodbye.");
			process.exit(0);
		});
	} catch (error) {
		if (error instanceof DeviceSDKApiError) {
			console.error(`✗ Error: ${error.message}`);
			process.exit(1);
		}
		throw error;
	}
}

async function executeCommand(
	token: string,
	projectId: string,
	deviceId: string,
	command: DeviceCommandRequest,
	rl: readline.Interface,
): Promise<void> {
	try {
		const response = await sendDeviceCommand(
			token,
			projectId,
			deviceId,
			command,
		);
		console.log(formatResponse(response));
	} catch (error) {
		if (error instanceof DeviceSDKApiError) {
			if (error.statusCode === 503) {
				console.error("\x1b[33mDevice is not connected.\x1b[0m");
			} else if (error.statusCode === 504) {
				console.error("\x1b[33mTimeout: Device did not respond.\x1b[0m");
			} else {
				console.error(`\x1b[31mError: ${error.message}\x1b[0m`);
			}
		} else {
			console.error(`\x1b[31mError: ${(error as Error).message}\x1b[0m`);
		}
	}
	rl.prompt();
}
