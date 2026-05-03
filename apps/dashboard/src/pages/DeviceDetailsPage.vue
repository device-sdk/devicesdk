<template>
  <q-page class="device-details-page q-pa-lg">
    <div class="row items-center q-mb-lg">
      <q-btn
        flat
        color="primary"
        icon="arrow_back"
        label="Back"
        :to="`/projects/${projectId}`"
        class="back-btn"
      />
      <q-breadcrumbs class="q-ml-md text-grey-7">
        <q-breadcrumbs-el icon="folder" to="/projects" />
        <q-breadcrumbs-el :label="projectId" :to="`/projects/${projectId}`" />
        <q-breadcrumbs-el :label="device?.name || deviceId" />
      </q-breadcrumbs>
    </div>

    <div v-if="loading" class="text-center q-pa-xl">
      <q-spinner-dots color="primary" size="50px" />
      <p class="q-mt-md text-grey-6">Loading device...</p>
    </div>

    <template v-else-if="device">
      <div class="q-mb-md">
        <div class="row items-center q-gutter-sm">
          <h1 class="page-title">{{ device.name || device.device_id }}</h1>
          <q-chip
            :color="isOnline ? 'positive' : 'grey-4'"
            :text-color="isOnline ? 'white' : 'grey-7'"
            size="sm"
          >
            {{ isOnline ? 'Online' : 'Offline' }}
          </q-chip>
        </div>
        <p class="page-subtitle font-mono">{{ device.device_id }}</p>
      </div>

      <q-card class="modern-card" flat bordered>
        <q-tabs
          v-model="activeTab"
          class="text-grey-8"
          active-color="primary"
          indicator-color="primary"
          align="left"
        >
          <q-tab name="overview" label="Overview" icon="info" />
          <q-tab name="script" label="Script" icon="code" />
          <q-tab name="versions" label="Versions" icon="history" />
          <q-tab name="logs" label="Logs" icon="article" />
          <q-tab name="settings" label="Settings" icon="settings" />
        </q-tabs>

        <q-separator />

        <q-tab-panels v-model="activeTab" animated>
          <q-tab-panel name="overview" class="q-pa-lg">
            <div class="row q-col-gutter-lg">
              <div class="col-12 col-md-6">
                <div class="info-section">
                  <div class="text-subtitle2 text-weight-bold q-mb-md">Device Information</div>
                  <div class="info-row">
                    <span class="info-label">Slug</span>
                    <span class="info-value font-mono">{{ device.device_id }}</span>
                  </div>
                  <div class="info-row">
                    <span class="info-label">Name</span>
                    <span class="info-value">{{ device.name || '—' }}</span>
                  </div>
                  <div class="info-row">
                    <span class="info-label">Description</span>
                    <span class="info-value">{{ device.description || '—' }}</span>
                  </div>
                  <div class="info-row">
                    <span class="info-label">Status</span>
                    <q-chip
                      :color="isOnline ? 'positive' : 'grey-4'"
                      :text-color="isOnline ? 'white' : 'grey-7'"
                      size="sm"
                    >
                      {{ isOnline ? 'Online' : 'Offline' }}
                    </q-chip>
                  </div>
                  <div class="info-row">
                    <span class="info-label">Last Connected</span>
                    <span class="info-value">
                      {{ device.last_connected_at ? formatDate(device.last_connected_at) : 'Never' }}
                    </span>
                  </div>
                  <div class="info-row">
                    <span class="info-label">Created</span>
                    <span class="info-value">{{ formatDate(device.created_at) }}</span>
                  </div>
                </div>
              </div>
              <div class="col-12 col-md-6">
                <div class="info-section">
                  <div class="text-subtitle2 text-weight-bold q-mb-md">Current Script</div>
                  <div v-if="device.current_version_id" class="info-row">
                    <span class="info-label">Version ID</span>
                    <span class="info-value font-mono">{{ device.current_version_id }}</span>
                  </div>
                  <div v-else class="text-grey-6 text-center q-pa-lg">
                    <q-icon name="code_off" size="48px" class="q-mb-md" />
                    <div>No script deployed</div>
                  </div>
                </div>

                <div class="info-section q-mt-md">
                  <div class="text-subtitle2 text-weight-bold q-mb-md">Quick Actions</div>
                  <q-btn
                    outline
                    color="primary"
                    label="Upload Script"
                    icon="upload"
                    class="full-width q-mb-sm"
                    @click="activeTab = 'script'"
                  />
                  <q-btn
                    outline
                    color="grey-7"
                    label="Edit Device"
                    icon="edit"
                    class="full-width"
                    @click="showEditDialog = true"
                  />
                </div>
              </div>
            </div>
          </q-tab-panel>

          <q-tab-panel name="script" class="q-pa-lg">
            <div class="row items-center justify-between q-mb-md">
              <div class="text-subtitle1 text-weight-bold">Script Editor</div>
              <q-select
                v-model="selectedTemplate"
                :options="scriptTemplates"
                label="Load Template"
                outlined
                dense
                emit-value
                map-options
                style="min-width: 200px"
                @update:model-value="loadTemplate"
              />
            </div>

            <div class="code-editor-container q-mb-md">
              <q-input
                v-model="scriptContent"
                type="textarea"
                outlined
                :rows="18"
                class="code-editor font-mono"
                placeholder="// Enter your device script here..."
              />
              <div :class="['text-caption q-mt-xs', isScriptTooLarge ? 'text-negative' : 'text-grey-6']">
                {{ scriptContent.length.toLocaleString() }} / 1,048,576 characters
                <span v-if="isScriptTooLarge" class="text-weight-bold"> - Script too large!</span>
              </div>
            </div>

            <div class="row items-center q-gutter-md">
              <q-input
                v-model="deployMessage"
                outlined
                dense
                label="Deployment message (optional)"
                class="col"
                maxlength="500"
              />
              <q-btn
                unelevated
                color="primary"
                label="Deploy Script"
                icon="rocket_launch"
                :loading="deploying"
                :disable="!scriptContent.trim() || isScriptTooLarge"
                @click="deployScript"
              />
            </div>
          </q-tab-panel>

          <q-tab-panel name="versions" class="q-pa-lg">
            <div class="text-subtitle1 text-weight-bold q-mb-lg">Version History</div>
            
            <q-table
              :rows="versions"
              :columns="versionColumns"
              row-key="version_id"
              flat
              :loading="loadingVersions"
              :rows-per-page-options="[10, 25, 50]"
            >
              <template #body="props">
                <q-tr :props="props">
                  <q-td key="version_id" :props="props">
                    <div class="row items-center">
                      <span class="font-mono">{{ props.row.version_id.slice(0, 8) }}...</span>
                      <q-chip
                        v-if="props.row.is_current"
                        color="primary"
                        text-color="white"
                        size="xs"
                        class="q-ml-sm"
                      >
                        Current
                      </q-chip>
                    </div>
                  </q-td>
                  <q-td key="message" :props="props">
                    {{ props.row.message || '—' }}
                  </q-td>
                  <q-td key="created_at" :props="props">
                    {{ formatDate(props.row.created_at) }}
                  </q-td>
                  <q-td key="actions" :props="props">
                    <q-btn
                      flat
                      dense
                      icon="visibility"
                      @click="viewVersion(props.row.version_id)"
                    >
                      <q-tooltip>View</q-tooltip>
                    </q-btn>
                    <q-btn
                      v-if="!props.row.is_current"
                      flat
                      dense
                      icon="restore"
                      color="primary"
                      @click="rollbackToVersion(props.row.version_id)"
                    >
                      <q-tooltip>Deploy this version</q-tooltip>
                    </q-btn>
                  </q-td>
                </q-tr>
              </template>

              <template #no-data>
                <div class="full-width text-center q-pa-xl">
                  <q-icon name="history" size="64px" color="grey-4" class="q-mb-md" />
                  <div class="text-h6 text-grey-6 q-mb-sm">No versions yet</div>
                  <p class="text-body2 text-grey-5">Deploy your first script to create a version</p>
                </div>
              </template>
            </q-table>
          </q-tab-panel>

          <q-tab-panel name="logs" class="q-pa-lg">
            <DeviceLogs :project-id="projectId" :device-id="deviceId" />
          </q-tab-panel>

          <q-tab-panel name="settings" class="q-pa-lg">
            <div class="settings-section q-mb-xl">
              <div class="text-subtitle1 text-weight-bold q-mb-md">Device Details</div>
              <q-form @submit="updateDevice">
                <q-input
                  v-model="editForm.name"
                  outlined
                  label="Device Name"
                  class="q-mb-md"
                />
                <q-input
                  v-model="editForm.description"
                  outlined
                  label="Description"
                  type="textarea"
                  rows="3"
                  class="q-mb-md"
                />
                <q-btn
                  unelevated
                  color="primary"
                  label="Save Changes"
                  type="submit"
                  :loading="saving"
                />
              </q-form>
            </div>

            <q-separator class="q-my-lg" />

            <div class="danger-zone">
              <div class="text-subtitle1 text-weight-bold text-negative q-mb-md">Danger Zone</div>
              <q-card flat bordered class="bg-red-1">
                <q-card-section>
                  <div class="row items-center justify-between">
                    <div>
                      <div class="text-weight-medium">Delete Device</div>
                      <div class="text-caption text-grey-7">
                        Permanently delete this device and all its scripts
                      </div>
                    </div>
                    <q-btn
                      outline
                      color="negative"
                      label="Delete Device"
                      @click="showDeleteDialog = true"
                    />
                  </div>
                </q-card-section>
              </q-card>
            </div>
          </q-tab-panel>
        </q-tab-panels>
      </q-card>
    </template>

    <q-dialog v-model="showEditDialog">
      <q-card style="min-width: 400px">
        <q-card-section>
          <div class="text-h6">Edit Device</div>
        </q-card-section>
        <q-card-section>
          <q-input v-model="editForm.name" outlined label="Name" class="q-mb-md" />
          <q-input v-model="editForm.description" outlined label="Description" type="textarea" rows="3" />
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat label="Cancel" v-close-popup />
          <q-btn unelevated color="primary" label="Save" :loading="saving" @click="updateDevice" />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <q-dialog v-model="showDeleteDialog">
      <q-card style="min-width: 400px">
        <q-card-section class="row items-center">
          <q-icon name="warning" color="negative" size="32px" class="q-mr-md" />
          <span class="text-h6">Delete Device</span>
        </q-card-section>
        <q-card-section>
          <p>Are you sure you want to delete <strong>{{ deviceId }}</strong>?</p>
          <p class="text-caption text-negative">This action cannot be undone.</p>
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat label="Cancel" v-close-popup />
          <q-btn
            flat
            color="negative"
            label="Delete"
            :loading="deleting"
            @click="deleteDevice"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <q-dialog v-model="showVersionDialog" maximized>
      <q-card>
        <q-card-section class="row items-center">
          <div class="text-h6">Script Version: {{ viewingVersion?.version_id?.slice(0, 8) }}...</div>
          <q-space />
          <q-btn icon="close" flat round dense v-close-popup />
        </q-card-section>
        <q-separator />
        <q-card-section class="q-pa-none" style="height: calc(100vh - 100px); overflow: auto;">
          <pre class="q-pa-md font-mono" style="background: #1e1e1e; color: #d4d4d4; margin: 0; min-height: 100%;">{{ viewingVersion?.script }}</pre>
        </q-card-section>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useQuasar } from 'quasar';
import DeviceLogs from '@/components/DeviceLogs.vue';
import {
  deviceService,
  scriptService,
  type Device,
  type ScriptVersion,
  type ScriptVersionDetail,
} from '@/services/api.service';

const route = useRoute();
const router = useRouter();
const $q = useQuasar();

const projectId = ref(route.params.projectId as string);
const deviceId = ref(route.params.deviceId as string);
const device = ref<Device | null>(null);
const loading = ref(true);
const activeTab = ref('overview');
const saving = ref(false);
const deleting = ref(false);
const deploying = ref(false);

const showEditDialog = ref(false);
const showDeleteDialog = ref(false);
const showVersionDialog = ref(false);

const scriptContent = ref('');
const deployMessage = ref('');
const selectedTemplate = ref<string | null>(null);

const versions = ref<ScriptVersion[]>([]);
const loadingVersions = ref(false);
const viewingVersion = ref<ScriptVersionDetail | null>(null);

const editForm = ref({
  name: '',
  description: '',
});

const scriptTemplates = [
  { label: 'Basic Blink', value: 'blink' },
  { label: 'Temperature Monitor', value: 'temperature' },
  { label: 'I2C Sensor Reader', value: 'i2c' },
  { label: 'PWM Motor Control', value: 'pwm' },
  { label: 'Button LED Toggle', value: 'button' },
  { label: 'GPIO Input Monitor', value: 'gpio' },
];

const templateCode: Record<string, string> = {
  blink: `/**
 * Basic Blink — toggles the onboard LED every second.
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
    console.info('Device connected — starting blink');
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
    console.info('Device disconnected — blink stopped');
  }
}`,
  temperature: `/**
 * Temperature Monitor — reads an analog temperature sensor on an interval
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
 * I2C Sensor Reader — reads temperature and pressure from a BMP280 sensor.
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
    console.info('BMP280 initialised — reading every 5s');

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

    // Simplified (no calibration compensation) — raw values for demo purposes
    console.info(\`BMP280 raw — pressure ADC: \${adcP}, temperature ADC: \${adcT}\`);
    console.info('Note: add calibration compensation for accurate readings.');
  }

  async onMessage(_message: DeviceResponse) {}
}`,
  pwm: `/**
 * PWM Motor Control — sweeps a servo or DC motor speed up and down.
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
    console.info(\`PWM started on GP\${PWM_PIN} @ \${FREQUENCY} Hz — sweeping 5%–10%\`);

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
 * Button LED Toggle — press a button to toggle the onboard LED.
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
 * GPIO Input Monitor — logs state changes on multiple input pins.
 *
 * Wiring (example: two pushbuttons):
 *   Button A → GP16 → GND  (pull-up enabled)
 *   Button B → GP17 → GND  (pull-up enabled)
 *
 * Extend MONITORED_PINS to watch more pins (max depends on board).
 */
import { DeviceEntrypoint, type DeviceResponse } from '@devicesdk/core';

// Pins to monitor — add or remove as needed
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

const versionColumns = [
  { name: 'version_id', label: 'Version', field: 'version_id', align: 'left' as const },
  { name: 'message', label: 'Message', field: 'message', align: 'left' as const },
  { name: 'created_at', label: 'Created', field: 'created_at', align: 'left' as const },
  { name: 'actions', label: 'Actions', field: 'actions', align: 'right' as const },
];

const SCRIPT_MAX_LENGTH = 1048576;

const isScriptTooLarge = computed(() => scriptContent.value.length > SCRIPT_MAX_LENGTH);

const normalizeTimestamp = (timestamp: number): number => {
  // API may return seconds or milliseconds - normalize to milliseconds
  // If timestamp is less than year 2000 in ms, it's likely in seconds
  return timestamp < 946684800000 ? timestamp * 1000 : timestamp;
};

const isOnline = computed(() => {
  if (!device.value?.last_connected_at) return false;
  const lastConnected = normalizeTimestamp(device.value.last_connected_at);
  const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
  return lastConnected > fiveMinutesAgo;
});

const formatDate = (timestamp: number) => {
  const normalized = normalizeTimestamp(timestamp);
  return new Date(normalized).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const loadTemplate = (templateKey: string | null) => {
  if (templateKey && templateCode[templateKey]) {
    scriptContent.value = templateCode[templateKey];
  }
};

const fetchDevice = async () => {
  try {
    loading.value = true;
    device.value = await deviceService.getById(projectId.value, deviceId.value);
    editForm.value = {
      name: device.value.name || '',
      description: device.value.description || '',
    };
  } catch (error) {
    console.error('Error fetching device:', error);
    $q.notify({ type: 'negative', message: 'Failed to load device', position: 'top' });
  } finally {
    loading.value = false;
  }
};

const fetchCurrentScript = async () => {
  try {
    const current = await scriptService.getCurrent(projectId.value, deviceId.value);
    scriptContent.value = current.script || '';
  } catch {
    // No script deployed yet, that's ok
  }
};

const versionsCached = ref(false);

const fetchVersions = async (force = false) => {
  if (versionsCached.value && !force) return;
  try {
    loadingVersions.value = true;
    versions.value = await scriptService.getVersions(projectId.value, deviceId.value);
    versionsCached.value = true;
  } catch (error) {
    console.error('Error fetching versions:', error);
  } finally {
    loadingVersions.value = false;
  }
};

const deployScript = async () => {
  if (isScriptTooLarge.value) {
    $q.notify({ type: 'negative', message: 'Script exceeds maximum size of 1MB', position: 'top' });
    return;
  }
  try {
    deploying.value = true;
    await scriptService.upload(projectId.value, deviceId.value, {
      script: scriptContent.value,
      message: deployMessage.value || undefined,
    });
    $q.notify({ type: 'positive', message: 'Script deployed successfully', position: 'top' });
    deployMessage.value = '';
    versionsCached.value = false;
    await fetchDevice();
    await fetchVersions(true);
  } catch (error) {
    console.error('Error deploying script:', error);
    const message = error instanceof Error ? error.message : 'Failed to deploy script';
    $q.notify({ type: 'negative', message, position: 'top' });
  } finally {
    deploying.value = false;
  }
};

const viewVersion = async (versionId: string) => {
  try {
    viewingVersion.value = await scriptService.getVersion(projectId.value, deviceId.value, versionId);
    showVersionDialog.value = true;
  } catch (error) {
    console.error('Error fetching version:', error);
    $q.notify({ type: 'negative', message: 'Failed to load version', position: 'top' });
  }
};

const rollbackToVersion = async (versionId: string) => {
  try {
    await scriptService.deployVersion(projectId.value, deviceId.value, versionId);
    $q.notify({ type: 'positive', message: 'Version deployed successfully', position: 'top' });
    versionsCached.value = false;
    await fetchDevice();
    await fetchVersions(true);
    await fetchCurrentScript();
  } catch (error) {
    console.error('Error deploying version:', error);
    $q.notify({ type: 'negative', message: 'Failed to deploy version', position: 'top' });
  }
};

const updateDevice = async () => {
  try {
    saving.value = true;
    await deviceService.update(projectId.value, deviceId.value, {
      name: editForm.value.name || undefined,
      description: editForm.value.description || undefined,
    });
    $q.notify({ type: 'positive', message: 'Device updated', position: 'top' });
    showEditDialog.value = false;
    await fetchDevice();
  } catch (error) {
    console.error('Error updating device:', error);
    $q.notify({ type: 'negative', message: 'Failed to update device', position: 'top' });
  } finally {
    saving.value = false;
  }
};

const deleteDevice = async () => {
  try {
    deleting.value = true;
    await deviceService.delete(projectId.value, deviceId.value);
    $q.notify({ type: 'positive', message: 'Device deleted', position: 'top' });
    void router.push(`/projects/${projectId.value}`);
  } catch (error) {
    console.error('Error deleting device:', error);
    $q.notify({ type: 'negative', message: 'Failed to delete device', position: 'top' });
  } finally {
    deleting.value = false;
  }
};

watch(activeTab, (tab) => {
  if (tab === 'script' && !scriptContent.value) {
    void fetchCurrentScript();
  }
  if (tab === 'versions') {
    void fetchVersions();
  }
});

watch(() => route.params, (newParams) => {
  if (newParams.projectId && newParams.deviceId) {
    projectId.value = newParams.projectId as string;
    deviceId.value = newParams.deviceId as string;
    versionsCached.value = false;
    void fetchDevice();
  }
});

onMounted(() => {
  void fetchDevice();
});
</script>

<style scoped lang="scss">
.device-details-page {
  background: var(--background-secondary);
  min-height: 100vh;
}

.page-title {
  font-size: 1.5rem;
  font-weight: 600;
  letter-spacing: -0.025em;
  color: var(--foreground);
  margin: 0;
}

.page-subtitle {
  font-size: 0.875rem;
  color: var(--foreground-muted);
  margin: 0.25rem 0 0;
}

.code-editor {
  :deep(.q-field__control) {
    border-radius: var(--radius);
    overflow: hidden;
  }
  
  :deep(textarea) {
    font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace;
    font-size: 0.8125rem;
    line-height: 1.6;
    background: hsl(240, 10%, 10%);
    color: hsl(0, 0%, 90%);
    padding: 1rem;
  }
}
</style>
