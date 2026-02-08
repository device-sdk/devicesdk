<script setup lang="ts">
import { computed } from "vue";
import type { PinType } from "@/lib/types";
import PinComponent from "./PinComponent.vue";

const props = defineProps<{
	pins: PinType[];
}>();

const emit = defineEmits<{
	pinUpdate: [pin: PinType];
}>();

const ledPin = computed(() => props.pins.find((p) => p.id === 99) as PinType);

const leftPins = computed(() =>
	props.pins
		.filter((p) => p.position.left !== undefined && p.id !== 99)
		.sort((a, b) => a.id - b.id),
);

const rightPins = computed(() =>
	props.pins
		.filter((p) => p.position.right !== undefined && p.id !== 99)
		.sort((a, b) => b.id - a.id),
);
</script>

<template>
	<div
		class="bg-[#2A563F] w-auto h-auto rounded-lg shadow-lg border-2 border-[#1E3C2C] p-4 flex flex-row items-center justify-center gap-2"
	>
		<!-- Left Pins Column -->
		<div class="flex flex-col gap-y-[3px]">
			<PinComponent
				v-for="pin in leftPins"
				:key="pin.id"
				:pin="pin"
				side="left"
				@update="emit('pinUpdate', $event)"
			/>
		</div>

		<!-- Center Board Column -->
		<div
			class="w-[150px] h-[500px] flex flex-col justify-between items-center"
		>
			<!-- Pico Chip -->
			<div
				class="w-[90px] h-[90px] bg-gray-700 rounded-sm flex items-center justify-center mt-20"
			>
				<span class="text-white font-bold text-center text-lg leading-tight"
					>Pico 2 W</span
				>
			</div>

			<div class="flex flex-col items-center gap-2">
				<!-- LED -->
				<PinComponent
					:pin="ledPin"
					side="center"
					@update="emit('pinUpdate', $event)"
				/>
				<!-- USB Port -->
				<div
					class="w-[35px] h-[12px] bg-gray-400 rounded-sm border border-gray-500"
				/>
			</div>
		</div>

		<!-- Right Pins Column -->
		<div class="flex flex-col gap-y-[3px]">
			<PinComponent
				v-for="pin in rightPins"
				:key="pin.id"
				:pin="pin"
				side="right"
				@update="emit('pinUpdate', $event)"
			/>
		</div>
	</div>
</template>
