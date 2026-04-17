import type {
	DeviceCommand,
	DeviceResponse,
	DisplayUpdateCommand,
} from "@devicesdk/core";
import { ref } from "vue";
import { usePinStateStore } from "@/stores/pinState";
import { useSimulatorStore } from "@/stores/simulator";
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

	const latestDisplayUpdate = ref<DisplayUpdateCommand>();

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
				const value =
					mode === "digital"
						? s.digitalState === "high"
							? 1
							: 0
						: (s.analog?.raw ?? 0);
				simulator.addLog(
					`GPIO ${pin} read: ${value} (${mode})`,
					"get_pin_state",
				);
				return {
					id: command.id,
					type: "pin_state_update",
					payload: { pin, mode, value },
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
				latestDisplayUpdate.value = command;
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
				latestDisplayUpdate.value = undefined;
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
				simulator.addLog(
					`UART port ${command.payload.port} configured: TX=GPIO ${command.payload.tx_pin}, RX=GPIO ${command.payload.rx_pin}, ${command.payload.baud_rate} baud`,
					"uart_configure",
				);
				return ack(command);
			}

			case "uart_write": {
				simulator.addLog(
					`UART write port ${command.payload.port}: [${command.payload.data.join(", ")}]`,
					"uart_write",
				);
				return ack(command);
			}

			case "uart_read": {
				simulator.addLog(
					`UART read port ${command.payload.port}: ${command.payload.bytes_to_read} bytes (simulated)`,
					"uart_read",
				);
				return {
					id: command.id,
					type: "uart_read_result",
					payload: {
						port: command.payload.port,
						data: [],
						bytes_read: 0,
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
		latestDisplayUpdate,
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
