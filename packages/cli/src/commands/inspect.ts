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
