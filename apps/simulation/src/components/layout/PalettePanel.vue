<script setup lang="ts">
import { computed } from "vue";
import { WIDGET_BLUEPRINTS } from "@/composables/useDragDrop";
import { useDragDrop } from "@/composables/useDragDrop";
import { useSimulatorStore } from "@/stores/simulator";
import type { WidgetKind } from "@/stores/widgets";
import { useWidgetsStore } from "@/stores/widgets";

type ItemStatus = "ready" | "soon";

interface PaletteItem {
	kind: WidgetKind | string;
	name: string;
	description: string;
	glyph: string;
	category: "sensor" | "probe";
	status: ItemStatus;
}

const simulator = useSimulatorStore();
const widgets = useWidgetsStore();
const { startDrag, endDrag } = useDragDrop();

const sensors = computed<PaletteItem[]>(() => [
	{
		kind: WIDGET_BLUEPRINTS.button.kind,
		name: WIDGET_BLUEPRINTS.button.name,
		description: WIDGET_BLUEPRINTS.button.description,
		glyph: WIDGET_BLUEPRINTS.button.glyph,
		category: "sensor",
		status: "ready",
	},
	{
		kind: "bme280",
		name: "BME280",
		description: "Temp + humidity + pressure (I2C)",
		glyph: "🌡",
		category: "sensor",
		status: "soon",
	},
	{
		kind: "dht22",
		name: "DHT22",
		description: "Temp + humidity (one-wire GPIO)",
		glyph: "💧",
		category: "sensor",
		status: "soon",
	},
	{
		kind: "bh1750",
		name: "BH1750",
		description: "Ambient light lux sensor (I2C)",
		glyph: "☀",
		category: "sensor",
		status: "soon",
	},
]);

const probes = computed<PaletteItem[]>(() => [
	{
		kind: "voltmeter",
		name: "Voltmeter",
		description: "Passive voltage readout on any pin",
		glyph: "V",
		category: "probe",
		status: "soon",
	},
	{
		kind: "logic-analyzer",
		name: "Logic Analyzer",
		description: "Focused oscilloscope on selected pins",
		glyph: "〰",
		category: "probe",
		status: "soon",
	},
	{
		kind: "i2c-injector",
		name: "I2C Byte Injector",
		description: "Push arbitrary bytes as any I2C device",
		glyph: "⇄",
		category: "probe",
		status: "soon",
	},
]);

function handleDragStart(event: DragEvent, item: PaletteItem) {
	if (item.status !== "ready") {
		event.preventDefault();
		return;
	}
	const pinsInUse = widgets.pinsInUse();
	startDrag(event, item.kind as WidgetKind, simulator.board, pinsInUse);
}

function handleDragEnd() {
	endDrag();
}
</script>

<template>
	<aside
		class="flex flex-col h-full bg-card text-card-foreground border-r overflow-y-auto"
	>
		<div class="p-3 border-b">
			<h2 class="text-sm font-semibold">Palette</h2>
			<p class="text-[11px] text-muted-foreground">
				Drag onto a pin to attach
			</p>
		</div>

		<section class="p-3 space-y-2">
			<h3
				class="text-[10px] font-bold uppercase text-muted-foreground tracking-wider"
			>
				Sensors
			</h3>
			<div
				v-for="item in sensors"
				:key="item.kind"
				:class="[
					'group flex items-center gap-2 rounded-md border p-2',
					item.status === 'ready'
						? 'cursor-grab active:cursor-grabbing hover:border-primary/60 hover:bg-accent/30'
						: 'opacity-50 cursor-not-allowed',
				]"
				:draggable="item.status === 'ready'"
				@dragstart="handleDragStart($event, item)"
				@dragend="handleDragEnd"
			>
				<span
					class="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-secondary text-secondary-foreground text-sm font-bold"
				>
					{{ item.glyph }}
				</span>
				<div class="flex-1 min-w-0">
					<div class="flex items-center gap-1">
						<span class="text-[12px] font-medium truncate">
							{{ item.name }}
						</span>
						<span
							v-if="item.status === 'soon'"
							class="text-[8px] rounded-full px-1.5 py-0.5 bg-muted text-muted-foreground"
						>
							SOON
						</span>
					</div>
					<p class="text-[10px] text-muted-foreground truncate">
						{{ item.description }}
					</p>
				</div>
			</div>
		</section>

		<section class="p-3 space-y-2 border-t">
			<h3
				class="text-[10px] font-bold uppercase text-muted-foreground tracking-wider"
			>
				Probes
			</h3>
			<div
				v-for="item in probes"
				:key="item.kind"
				class="flex items-center gap-2 rounded-md border p-2 opacity-50 cursor-not-allowed"
			>
				<span
					class="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-secondary text-secondary-foreground text-sm font-bold"
				>
					{{ item.glyph }}
				</span>
				<div class="flex-1 min-w-0">
					<div class="flex items-center gap-1">
						<span class="text-[12px] font-medium truncate">
							{{ item.name }}
						</span>
						<span
							class="text-[8px] rounded-full px-1.5 py-0.5 bg-muted text-muted-foreground"
						>
							SOON
						</span>
					</div>
					<p class="text-[10px] text-muted-foreground truncate">
						{{ item.description }}
					</p>
				</div>
			</div>
		</section>
	</aside>
</template>
