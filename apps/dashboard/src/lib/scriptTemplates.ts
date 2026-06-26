// Starter templates surfaced in the device script editor's "Load Template"
// dropdown. The list controls dropdown order; templateCode keys must match
// the dropdown values exactly.

export const scriptTemplates = [
  { label: 'Basic Blink', value: 'blink' },
  { label: 'Temperature Monitor', value: 'temperature' },
  { label: 'I2C Sensor Reader', value: 'i2c' },
  { label: 'PWM Motor Control', value: 'pwm' },
  { label: 'Button LED Toggle', value: 'button' },
  { label: 'GPIO Input Monitor', value: 'gpio' },
];

export const templateCode: Record<string, string> = {
  blink: `/**
 * Basic Blink - toggles the onboard LED every second.
 *
 * Works out of the box on any DeviceSDK-supported board.
 * Pin 99 is the virtual onboard LED (no wiring required).
 */
import { DeviceEntrypoint } from '@devicesdk/core';

const LED_PIN = 99;          // Onboard LED (virtual pin 99)
const INTERVAL_MS = 1000;    // Blink every 1 second

export default class BlinkDevice extends DeviceEntrypoint {
  private blinkTimer: ReturnType<typeof setInterval> | null = null;
  private ledOn = false;

  async onDeviceConnect() {
    console.info('Device connected - starting blink');
    this.ledOn = false;
    await this.env.DEVICE.setGpioState(LED_PIN, 'low');

    this.blinkTimer = setInterval(() => {
      this.ledOn = !this.ledOn;
      this.env.DEVICE.setGpioState(LED_PIN, this.ledOn ? 'high' : 'low')
        .catch((err) => console.error('Blink GPIO error:', err));
    }, INTERVAL_MS);
  }

  async onDeviceDisconnect() {
    if (this.blinkTimer !== null) {
      clearInterval(this.blinkTimer);
      this.blinkTimer = null;
    }
    console.info('Device disconnected - blink stopped');
  }
}`,
  temperature: `/**
 * Temperature Monitor - reads an analog temperature sensor on an interval
 * and logs the value in °C and °F.
 *
 * Wiring (MCP9700A or compatible):
 *   Sensor Vout → GP26 (ADC0)
 *   Sensor VDD  → 3.3V
 *   Sensor GND  → GND
 */
import { DeviceEntrypoint, type DeviceResponse } from '@devicesdk/core';

const TEMP_PIN = 26;               // GP26 (ADC0)
const REPORT_INTERVAL_MS = 10_000; // Read every 10 seconds

export default class TemperatureMonitor extends DeviceEntrypoint {
  async onDeviceConnect() {
    console.info('Temperature monitor connected');

    // Configure GP26 as an analog input that reports on an interval
    await this.env.DEVICE.sendCommand({
      type: 'set_pin_config',
      payload: {
        pin: TEMP_PIN,
        mode: 'analog',
        report_policy: 'interval',
        report_interval_ms: REPORT_INTERVAL_MS,
      },
    });

    console.info(\`Reporting temperature every \${REPORT_INTERVAL_MS / 1000}s\`);
  }

  async onDeviceDisconnect() {
    console.info('Temperature monitor disconnected');
  }

  async onMessage(message: DeviceResponse) {
    if (
      message.type === 'pin_state_update' &&
      message.payload.mode === 'analog' &&
      message.payload.pin === TEMP_PIN
    ) {
      const raw = message.payload.value;

      // Convert raw ADC (0–4095 on Pico, 12-bit) → voltage → °C
      // Formula for MCP9700A: Vout = 500mV + 10mV/°C
      const voltage = (raw / 4095) * 3.3;
      const tempC = (voltage - 0.5) / 0.01;
      const tempF = tempC * 1.8 + 32;

      console.info(\`Temperature: \${tempC.toFixed(1)}°C / \${tempF.toFixed(1)}°F (raw=\${raw})\`);
    }
  }
}`,
  i2c: `/**
 * I2C Sensor Reader - reads temperature and pressure from a BMP280 sensor.
 *
 * Wiring (BMP280 breakout board):
 *   SDA → GP0
 *   SCL → GP1
 *   VCC → 3.3V
 *   GND → GND
 *
 * The BMP280 I2C address is 0x76 (SDO tied to GND) or 0x77 (SDO tied to VCC).
 */
import { DeviceEntrypoint, type DeviceResponse } from '@devicesdk/core';

const I2C_BUS = 0;
const SDA_PIN = 0;
const SCL_PIN = 1;
const BMP280_ADDRESS = '0x76';
const READ_INTERVAL_MS = 5_000;

export default class I2CSensorReader extends DeviceEntrypoint {
  private readTimer: ReturnType<typeof setInterval> | null = null;

  async onDeviceConnect() {
    console.info('I2C sensor reader connected');

    // Configure the I2C bus
    await this.env.DEVICE.sendCommand({
      type: 'i2c_configure',
      payload: { bus: I2C_BUS, sda_pin: SDA_PIN, scl_pin: SCL_PIN, frequency: 100_000 },
    });

    // BMP280: set normal mode + 1x oversampling for temp + pressure (0xB7 → ctrl_meas reg 0xF4)
    await this.env.DEVICE.i2cWrite(I2C_BUS, BMP280_ADDRESS, ['0xF4', '0xB7']);
    console.info('BMP280 initialised - reading every 5s');

    this.readTimer = setInterval(() => {
      this.readSensor().catch((err) => console.error('I2C read error:', err));
    }, READ_INTERVAL_MS);
  }

  async onDeviceDisconnect() {
    if (this.readTimer !== null) {
      clearInterval(this.readTimer);
      this.readTimer = null;
    }
    console.info('I2C sensor reader disconnected');
  }

  private async readSensor() {
    // Read 6 bytes from the pressure+temperature data registers (0xF7–0xFC)
    const result = await this.env.DEVICE.i2cRead(I2C_BUS, BMP280_ADDRESS, 6, '0xF7');

    if (result.type !== 'i2c_read_result') return;

    const data = result.payload.data.map((b: string) => parseInt(b, 16));
    const adcP = (data[0] << 12) | (data[1] << 4) | (data[2] >> 4);
    const adcT = (data[3] << 12) | (data[4] << 4) | (data[5] >> 4);

    // Simplified (no calibration compensation) - raw values for demo purposes
    console.info(\`BMP280 raw - pressure ADC: \${adcP}, temperature ADC: \${adcT}\`);
    console.info('Note: add calibration compensation for accurate readings.');
  }

  async onMessage(_message: DeviceResponse) {}
}`,
  pwm: `/**
 * PWM Motor Control - sweeps a servo or DC motor speed up and down.
 *
 * Wiring (servo motor):
 *   Signal → GP15 (PWM)
 *   VCC    → 5V (external supply recommended)
 *   GND    → GND (common ground with Pico)
 *
 * Standard servo: 50 Hz, duty cycle 5%–10% (1ms–2ms pulse).
 */
import { DeviceEntrypoint } from '@devicesdk/core';

const PWM_PIN = 15;       // GP15
const FREQUENCY = 50;     // 50 Hz for standard servo
const STEP_MS = 20;       // Step every 20ms
const STEP_SIZE = 0.001;  // Duty cycle step (0.1% per tick)

export default class PwmMotorControl extends DeviceEntrypoint {
  private sweepTimer: ReturnType<typeof setInterval> | null = null;
  private dutyCycle = 0.05;   // Start at 5% (servo min position)
  private ascending = true;

  async onDeviceConnect() {
    console.info('PWM motor control connected');

    // Initialise PWM at minimum position
    await this.env.DEVICE.setPwmState(PWM_PIN, FREQUENCY, this.dutyCycle);
    console.info(\`PWM started on GP\${PWM_PIN} @ \${FREQUENCY} Hz - sweeping 5%–10%\`);

    // Sweep duty cycle back and forth
    this.sweepTimer = setInterval(() => {
      if (this.ascending) {
        this.dutyCycle = Math.min(0.10, this.dutyCycle + STEP_SIZE);
        if (this.dutyCycle >= 0.10) this.ascending = false;
      } else {
        this.dutyCycle = Math.max(0.05, this.dutyCycle - STEP_SIZE);
        if (this.dutyCycle <= 0.05) this.ascending = true;
      }
      this.env.DEVICE.setPwmState(PWM_PIN, FREQUENCY, this.dutyCycle)
        .catch((err) => console.error('PWM sweep error:', err));
    }, STEP_MS);
  }

  async onDeviceDisconnect() {
    if (this.sweepTimer !== null) {
      clearInterval(this.sweepTimer);
      this.sweepTimer = null;
    }
    console.info('PWM motor control disconnected');
  }
}`,
  button: `/**
 * Button LED Toggle - press a button to toggle the onboard LED.
 *
 * Wiring:
 *   Button: one leg → GP20, other leg → GND
 *   (uses internal pull-up; no external resistor needed)
 *
 * LED state persists across device reconnections via KV storage.
 */
import { DeviceEntrypoint, type DeviceResponse } from '@devicesdk/core';

const BUTTON_PIN = 20;  // GP20
const LED_PIN = 99;     // Onboard LED (virtual pin 99)

export default class ButtonLedToggle extends DeviceEntrypoint {
  private lastPressAt = 0;
  private readonly DEBOUNCE_MS = 50;

  // NOTE: Use DEVICE.kv for state that must survive reconnections.
  // Class properties are reset every time the device reconnects.

  async onDeviceConnect() {
    console.info('Button LED toggle connected');

    // Enable GPIO input monitoring on the button pin with pull-up
    await this.env.DEVICE.configureGpioInputMonitoring(BUTTON_PIN, true, 'up');

    // Restore LED to its last known state
    const ledOn = (await this.env.DEVICE.kv.get<boolean>('ledOn')) ?? false;
    await this.env.DEVICE.setGpioState(LED_PIN, ledOn ? 'high' : 'low');

    console.info(\`Ready! LED is \${ledOn ? 'ON' : 'OFF'}. Press button on GP\${BUTTON_PIN}.\`);
  }

  async onDeviceDisconnect() {
    console.info('Button LED toggle disconnected');
  }

  async onMessage(message: DeviceResponse) {
    // Button pressed = pin goes LOW (pull-up resistor keeps it HIGH at rest)
    if (
      message.type === 'gpio_state_changed' &&
      message.payload.pin === BUTTON_PIN &&
      message.payload.state === 'low'
    ) {
      const now = Date.now();
      if (now - this.lastPressAt < this.DEBOUNCE_MS) return;
      this.lastPressAt = now;

      const ledOn = !((await this.env.DEVICE.kv.get<boolean>('ledOn')) ?? false);

      // Persist BEFORE updating hardware so state is never lost
      await this.env.DEVICE.kv.put('ledOn', ledOn);
      await this.env.DEVICE.setGpioState(LED_PIN, ledOn ? 'high' : 'low');

      console.info(\`LED \${ledOn ? 'ON' : 'OFF'}\`);
    }
  }
}`,
  gpio: `/**
 * GPIO Input Monitor - logs state changes on multiple input pins.
 *
 * Wiring (example: two pushbuttons):
 *   Button A → GP16 → GND  (pull-up enabled)
 *   Button B → GP17 → GND  (pull-up enabled)
 *
 * Extend MONITORED_PINS to watch more pins (max depends on board).
 */
import { DeviceEntrypoint, type DeviceResponse } from '@devicesdk/core';

// Pins to monitor - add or remove as needed
const MONITORED_PINS: number[] = [16, 17];

export default class GpioInputMonitor extends DeviceEntrypoint {
  async onDeviceConnect() {
    console.info('GPIO input monitor connected');

    // Enable monitoring on every configured pin
    for (const pin of MONITORED_PINS) {
      await this.env.DEVICE.configureGpioInputMonitoring(pin, true, 'up');
      console.info(\`Monitoring GP\${pin}\`);
    }

    console.info('Listening for GPIO state changes...');
  }

  async onDeviceDisconnect() {
    console.info('GPIO input monitor disconnected');
  }

  async onMessage(message: DeviceResponse) {
    if (message.type === 'gpio_state_changed' && MONITORED_PINS.includes(message.payload.pin)) {
      const { pin, state } = message.payload;
      const label = state === 'low' ? 'PRESSED' : 'RELEASED';
      console.info(\`GP\${pin} → \${label} (\${state})\`);
    }
  }
}`,
};
