<script setup lang="ts">
import { ref, computed } from "vue";
import type {
	PinType,
	SensorType,
	SensorInfo,
	ConnectedSensor,
} from "@/lib/types";

const props = defineProps<{
	pins: PinType[];
	connectedSensors: ConnectedSensor[];
}>();

const emit = defineEmits<{
	connectSensor: [sensor: ConnectedSensor];
	disconnectSensor: [sensorType: string];
	log: [message: string];
}>();

const SENSOR_PRESETS: SensorInfo[] = [
	{
		name: "DHT22",
		protocol: "I2C",
		pins: { SDA: "I2C SDA", SCL: "I2C SCL" },
	},
	{
		name: "SSD1306 OLED",
		protocol: "SPI",
		pins: { SCK: "SPI SCK", MOSI: "SPI TX", CS: "SPI CSn" },
	},
	{
		name: "Push Button",
		protocol: "ADC",
		pins: { "ADC Pin": "ADC" },
	},
];

const selectedSensorType = ref<SensorType | "">("");
const pinSelections = ref<Record<string, number | "">>({});

const selectedSensorInfo = computed(() =>
	SENSOR_PRESETS.find((p) => p.name === selectedSensorType.value),
);

function getPinsByFunction(funcSubstring: string): PinType[] {
	const parts = funcSubstring.trim().split(/\s+/);
	return props.pins
		.filter(
			(p) =>
				p.gpio !== null &&
				parts.every((part) => p.functions.some((f) => f.includes(part))),
		)
		.sort((a, b) => (a.gpio as number) - (b.gpio as number));
}

function handleSensorTypeChange(event: Event) {
	selectedSensorType.value = (event.target as HTMLSelectElement)
		.value as SensorType;
	pinSelections.value = {};
}

function handlePinSelectionChange(pinRole: string, event: Event) {
	const value = (event.target as HTMLSelectElement).value;
	pinSelections.value = {
		...pinSelections.value,
		[pinRole]: Number.parseInt(value, 10),
	};
}

function handleConnect() {
	if (!selectedSensorInfo.value) {
		emit("log", "Error: No sensor type selected.");
		return;
	}

	const requiredPins = Object.keys(selectedSensorInfo.value.pins);
	const selectedPins = Object.keys(pinSelections.value).filter(
		(p) => pinSelections.value[p] !== "",
	);

	if (requiredPins.length !== selectedPins.length) {
		emit(
			"log",
			`Error: Please select all required pins for ${selectedSensorInfo.value.name}.`,
		);
		return;
	}

	emit("connectSensor", {
		type: selectedSensorInfo.value.name,
		pins: pinSelections.value as Record<string, number>,
	});

	selectedSensorType.value = "";
	pinSelections.value = {};
}
</script>

<template>
	<div class="rounded-lg border bg-card text-card-foreground shadow-sm">
		<div class="flex flex-col space-y-1.5 p-6">
			<h3 class="text-2xl font-semibold leading-none tracking-tight">
				Virtual Sensor Connector
			</h3>
			<p class="text-sm text-muted-foreground">
				Connect virtual sensors to the board pins.
			</p>
		</div>
		<div class="p-6 pt-0 space-y-4">
			<!-- Connected Sensors -->
			<div class="space-y-2">
				<label class="text-sm font-medium leading-none"
					>Connected Sensors</label
				>
				<div class="flex flex-wrap gap-2">
					<template v-if="connectedSensors.length > 0">
						<div
							v-for="sensor in connectedSensors"
							:key="sensor.type"
							class="flex items-center gap-2 p-2 border rounded-md bg-muted/50"
						>
							<span class="text-sm font-medium">{{
								sensor.type
							}}</span>
							<button
								class="inline-flex items-center justify-center h-6 w-6 rounded-md hover:bg-muted transition-colors"
								@click="emit('disconnectSensor', sensor.type)"
							>
								<svg
									xmlns="http://www.w3.org/2000/svg"
									width="16"
									height="16"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2"
									stroke-linecap="round"
									stroke-linejoin="round"
									class="text-destructive"
								>
									<path d="M3 6h18" />
									<path
										d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"
									/>
									<path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
								</svg>
							</button>
						</div>
					</template>
					<p v-else class="text-sm text-muted-foreground">
						No sensors connected.
					</p>
				</div>
			</div>

			<!-- Sensor Type -->
			<div class="space-y-2">
				<label for="sensor-type" class="text-sm font-medium leading-none"
					>Sensor Type</label
				>
				<select
					id="sensor-type"
					:value="selectedSensorType"
					class="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
					@change="handleSensorTypeChange"
				>
					<option value="" disabled>Select a sensor to connect</option>
					<option
						v-for="preset in SENSOR_PRESETS"
						:key="preset.name"
						:value="preset.name"
					>
						{{ preset.name }}
					</option>
				</select>
			</div>

			<!-- Pin Selection -->
			<div
				v-if="selectedSensorInfo"
				class="grid grid-cols-2 gap-4"
			>
				<div
					v-for="[pinRole, pinFunction] in Object.entries(
						selectedSensorInfo.pins,
					)"
					:key="pinRole"
					class="space-y-2"
				>
					<label
						:for="`pin-${pinRole}`"
						class="text-sm font-medium leading-none"
					>
						{{ pinRole }}
					</label>
					<select
						:id="`pin-${pinRole}`"
						class="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
						@change="handlePinSelectionChange(pinRole, $event)"
					>
						<option value="" disabled selected>
							Select {{ pinRole }}
						</option>
						<option
							v-for="pin in getPinsByFunction(pinFunction)"
							:key="pin.id"
							:value="String(pin.gpio)"
						>
							GP{{ pin.gpio }}
						</option>
					</select>
				</div>
			</div>
		</div>
		<div class="flex items-center p-6 pt-0">
			<button
				class="inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium h-10 px-4 py-2 bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:pointer-events-none disabled:opacity-50"
				:disabled="
					!selectedSensorInfo ||
					Object.keys(pinSelections).length === 0
				"
				@click="handleConnect"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					width="16"
					height="16"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
				>
					<path
						d="M6 19v-3a1 1 0 0 1 1-1h4l3.3-3.7a1 1 0 0 1 1.5.1l3 3.7"
					/>
					<path d="M6 12V8a1 1 0 0 1 1-1h2.9a1 1 0 0 0 .7-.3L14 3" />
					<path d="M6 19h12a1 1 0 0 0 1-1v-1" />
				</svg>
				Connect Sensor
			</button>
		</div>
	</div>
</template>
