import type { DeviceCommand, DeviceResponse } from "@devicesdk/core";
import { usePinStateStore } from "@/stores/pinState";
import { useSimulatorStore } from "@/stores/simulator";
import { useUartStore } from "@/stores/uart";
import { useWidgetsStore } from "@/stores/widgets";

/**
 * Bridge between incoming DeviceCommands (firmware → simulator) and the Pinia stores.
 * In Phase 2 this becomes a thin router into the emulator registry; for now it handles
 * the same command set as the original Pico simulator, adapted to ESP32.
 */
export function useSimulator() {
	const simulator = useSimulatorStore();
	const pinState = usePinStateStore();
	const widgets = useWidgetsStore();
	const uart = useUartStore();

	function handleDeviceCommand(command: DeviceCommand): DeviceResponse | null {
		switch (command.type) {
			case "set_gpio_state": {
				const { pin, state } = command.payload;
				pinState.setMode(pin, "digital_output");
				pinState.setDigital(pin, state);
				simulator.addLog(
					`GPIO ${pin} → ${state.toUpperCase()}`,
					"set_gpio_state",
				);
				return ack(command);
			}

			case "set_pwm_state": {
				const { pin, frequency, duty_cycle } = command.payload;
				pinState.setPwm(pin, { frequency, dutyCycle: duty_cycle });
				simulator.addLog(
					`GPIO ${pin} PWM: ${frequency} Hz, ${Math.round(duty_cycle * 100)}% duty`,
					"set_pwm_state",
				);
				return ack(command);
			}

			case "get_pin_state": {
				const { pin, mode } = command.payload;
				const s = pinState.get(pin);
				// PinStateUpdate is a discriminated union by mode: digital → "high"|"low",
				// analog → number. Build the frame inline per branch so TS can narrow.
				if (mode === "digital") {
					const value = s.digitalState === "high" ? "high" : "low";
					simulator.addLog(
						`GPIO ${pin} read: ${value} (digital)`,
						"get_pin_state",
					);
					return {
						id: command.id,
						type: "pin_state_update",
						payload: { pin, mode: "digital", value },
					};
				}
				const value = s.analog?.raw ?? 0;
				simulator.addLog(
					`GPIO ${pin} read: ${value} (analog)`,
					"get_pin_state",
				);
				return {
					id: command.id,
					type: "pin_state_update",
					payload: { pin, mode: "analog", value },
				};
			}

			case "configure_gpio_input_monitoring": {
				const { pin, enable, pull } = command.payload;
				pinState.setMonitoring(pin, {
					enabled: enable,
					pull: pull ?? "none",
				});
				simulator.addLog(
					`GPIO ${pin} monitoring ${enable ? "enabled" : "disabled"}`,
					"configure_gpio_input_monitoring",
				);
				return ack(command);
			}

			case "display_update": {
				simulator.addLog(
					`Display update: ${command.payload.width}x${command.payload.height} (${command.payload.segments.length} segments)`,
					"display_update",
				);
				return ack(command);
			}

			case "i2c_configure": {
				simulator.addLog(
					`I2C bus ${command.payload.bus} configured: SDA=GPIO ${command.payload.sda_pin}, SCL=GPIO ${command.payload.scl_pin}`,
					"i2c_configure",
				);
				return ack(command);
			}

			case "i2c_scan": {
				simulator.addLog(`I2C scan bus ${command.payload.bus}: []`, "i2c_scan");
				return {
					id: command.id,
					type: "i2c_scan_result",
					payload: {
						bus: command.payload.bus,
						addresses_found: [],
					},
				};
			}

			case "i2c_write": {
				simulator.addLog(
					`I2C write to ${command.payload.address}: [${command.payload.data.join(", ")}]`,
					"i2c_write",
				);
				return ack(command);
			}

			case "i2c_read": {
				const zeros = Array.from(
					{ length: command.payload.bytes_to_read },
					() => "0x00",
				);
				simulator.addLog(
					`I2C read from ${command.payload.address}: ${command.payload.bytes_to_read} bytes`,
					"i2c_read",
				);
				return {
					id: command.id,
					type: "i2c_read_result",
					payload: {
						bus: command.payload.bus,
						address: command.payload.address,
						data: zeros,
					},
				};
			}

			case "i2c_batch_write": {
				simulator.addLog(
					`I2C batch write to ${command.payload.address}: ${command.payload.writes.length} writes`,
					"i2c_batch_write",
				);
				return ack(command);
			}

			case "reboot": {
				pinState.resetAll();
				uart.reset();
				simulator.addLog("Device rebooted", "reboot");
				return ack(command);
			}

			case "get_temperature": {
				simulator.addLog("Temperature: 25.0°C (simulated)", "get_temperature");
				return {
					id: command.id,
					type: "temperature_result",
					payload: { celsius: 25.0 },
				};
			}

			case "onewire_search": {
				const roms = [SIMULATED_DS18B20_ROM];
				simulator.addLog(
					`OneWire search on GPIO ${command.payload.pin}: ${roms.length} sensor(s) (simulated)`,
					"onewire_search",
				);
				return {
					id: command.id,
					type: "onewire_search_result",
					payload: { pin: command.payload.pin, roms },
				};
			}

			case "onewire_read_temp": {
				const rom = command.payload.rom;
				// Parity with the firmwares: a present-but-malformed rom must not
				// silently degrade into a Skip ROM read (wrong sensor on a
				// multi-drop bus).
				if (rom !== undefined && !ROM_RE.test(rom)) {
					return errorReply(
						command,
						"Invalid rom (expected 16 uppercase hex characters)",
					);
				}
				const romValue = rom ?? "";
				const celsius = jitter(21.5, 0.5);
				simulator.addLog(
					`DS18B20 on GPIO ${command.payload.pin}${romValue ? ` (${romValue})` : ""}: ${celsius}°C (simulated)`,
					"onewire_read_temp",
				);
				return {
					id: command.id,
					type: "onewire_temp_result",
					payload: { pin: command.payload.pin, rom: romValue, celsius },
				};
			}

			case "dht_read": {
				const celsius = jitter(21.5, 0.5);
				const humidityPct = jitter(45, 2);
				simulator.addLog(
					`${command.payload.model.toUpperCase()} on GPIO ${command.payload.pin}: ${celsius}°C, ${humidityPct}% RH (simulated)`,
					"dht_read",
				);
				return {
					id: command.id,
					type: "dht_read_result",
					payload: {
						pin: command.payload.pin,
						celsius,
						humidity_pct: humidityPct,
					},
				};
			}

			case "watchdog_configure": {
				const { enable, timeout_ms } = command.payload;
				simulator.addLog(
					`Watchdog ${enable ? `enabled (${timeout_ms}ms)` : "disabled"} (simulated)`,
					"watchdog_configure",
				);
				return ack(command);
			}

			case "watchdog_feed": {
				simulator.addLog("Watchdog fed (simulated)", "watchdog_feed");
				return ack(command);
			}

			case "spi_configure": {
				simulator.addLog(
					`SPI bus ${command.payload.bus} configured: CLK=GPIO ${command.payload.clk_pin}, MOSI=GPIO ${command.payload.mosi_pin}, MISO=GPIO ${command.payload.miso_pin}, CS=GPIO ${command.payload.cs_pin}`,
					"spi_configure",
				);
				return ack(command);
			}

			case "spi_transfer": {
				const zeros = Array.from(
					{ length: command.payload.data.length },
					() => "0x00",
				);
				simulator.addLog(
					`SPI transfer on bus ${command.payload.bus}: ${command.payload.data.length} bytes`,
					"spi_transfer",
				);
				return {
					id: command.id,
					type: "spi_transfer_result",
					payload: { bus: command.payload.bus, data: zeros },
				};
			}

			case "spi_write": {
				simulator.addLog(
					`SPI write on bus ${command.payload.bus}: [${command.payload.data.join(", ")}]`,
					"spi_write",
				);
				return ack(command);
			}

			case "spi_read": {
				const zeros = Array.from(
					{ length: command.payload.bytes_to_read },
					() => "0x00",
				);
				simulator.addLog(
					`SPI read on bus ${command.payload.bus}: ${command.payload.bytes_to_read} bytes`,
					"spi_read",
				);
				return {
					id: command.id,
					type: "spi_read_result",
					payload: { bus: command.payload.bus, data: zeros },
				};
			}

			case "uart_configure": {
				uart.configure(
					command.payload.port,
					command.payload.tx_pin,
					command.payload.rx_pin,
					command.payload.baud_rate,
				);
				simulator.addLog(
					`UART port ${command.payload.port} configured: TX=GPIO ${command.payload.tx_pin}, RX=GPIO ${command.payload.rx_pin}, ${command.payload.baud_rate} baud`,
					"uart_configure",
				);
				return ack(command);
			}

			case "uart_write": {
				const data = command.payload.data;
				simulator.addLog(
					`UART write port ${command.payload.port}: ${bytesSummary(data)}`,
					"uart_write",
				);
				return ack(command);
			}

			case "uart_read": {
				const { data, bytesRead } = uart.takeRead(
					command.payload.port,
					command.payload.bytes_to_read,
				);
				simulator.addLog(
					`UART read port ${command.payload.port}: ${bytesRead} byte(s) ${bytesSummary(data)}`,
					"uart_read",
				);
				return {
					id: command.id,
					type: "uart_read_result",
					payload: {
						port: command.payload.port,
						data,
						bytes_read: bytesRead,
					},
				};
			}

			case "pio_ws2812_configure": {
				simulator.addLog(
					`WS2812 configured: GPIO ${command.payload.pin}, ${command.payload.num_leds} LEDs`,
					"pio_ws2812_configure",
				);
				return ack(command);
			}

			case "pio_ws2812_update": {
				simulator.addLog(
					`WS2812 update: ${command.payload.pixels.length} pixels`,
					"pio_ws2812_update",
				);
				return ack(command);
			}

			default:
				return ack(command);
		}
	}

	return {
		handleDeviceCommand,
		widgets,
	};
}

function ack(command: DeviceCommand): DeviceResponse {
	return {
		id: command.id,
		type: "command_ack",
		payload: { command_type: command.type },
	};
}

function errorReply(command: DeviceCommand, error: string): DeviceResponse {
	return {
		id: command.id,
		type: "command_error",
		payload: { command_type: command.type, error },
	};
}

/** Matches the server-side ROM validation (`deviceSender.ts`). */
const ROM_RE = /^[0-9A-F]{16}$/;

/** Cap on hex bytes rendered per log line, so big writes stay readable. */
const LOG_BYTES_MAX = 48;

/** Compact hex + ASCII rendering of bytes for log lines. */
function bytesSummary(data: string[]): string {
	if (data.length === 0) return "[]";
	const shown = data.slice(0, LOG_BYTES_MAX);
	const hex = shown.join(", ");
	const suffix = data.length > LOG_BYTES_MAX ? " ..." : "";
	const chars = shown.map((hexByte) => {
		const code = Number.parseInt(hexByte, 16);
		return code >= 0x20 && code <= 0x7e ? String.fromCharCode(code) : ".";
	});
	return `[${hex}${suffix}] (${chars.join("")}${suffix})`;
}

/** ROM code of the single DS18B20 the simulated OneWire bus always reports. */
const SIMULATED_DS18B20_ROM = "28FF641E8D3C4A41";

/** Plausible sensor noise: `base` +/- `spread`, rounded to one decimal. */
function jitter(base: number, spread: number): number {
	return Math.round((base + (Math.random() * 2 - 1) * spread) * 10) / 10;
}
