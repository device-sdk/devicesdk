<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { useFloating, offset, flip, shift, autoUpdate } from "@floating-ui/vue";
import type { PinType } from "@/lib/types";

const props = defineProps<{
	pin: PinType;
	side: "left" | "right" | "center";
}>();

const emit = defineEmits<{
	update: [pin: PinType];
}>();

const isOpen = ref(false);
const triggerRef = ref<HTMLElement | null>(null);
const floatingRef = ref<HTMLElement | null>(null);

const placement = computed(() => {
	if (props.side === "left") return "left" as const;
	if (props.side === "right") return "right" as const;
	return "top" as const;
});

const { floatingStyles } = useFloating(triggerRef, floatingRef, {
	placement,
	middleware: [offset(8), flip(), shift({ padding: 8 })],
	whileElementsMounted: autoUpdate,
});

const isGpio = computed(() => props.pin.gpio !== null);
const isPowerOrGnd = computed(() => {
	const n = props.pin.name;
	return (
		n.includes("3V3") ||
		n.includes("GND") ||
		n.includes("VBUS") ||
		n.includes("VSYS")
	);
});
const isLed = computed(() => props.pin.id === 99);

const isInteractive = computed(
	() => (isGpio.value || isLed.value) && !isPowerOrGnd.value,
);

function togglePopover() {
	if (!isInteractive.value) return;
	isOpen.value = !isOpen.value;
}

function closePopover() {
	isOpen.value = false;
}

function handleModeChange() {
	const newMode = props.pin.mode === "OUTPUT" ? "INPUT" : "OUTPUT";
	emit("update", { ...props.pin, mode: newMode });
}

function handleStateChange() {
	const newState = props.pin.state === "HIGH" ? "LOW" : "HIGH";
	emit("update", {
		...props.pin,
		state: newState,
		value: newState === "HIGH" ? 1 : 0,
	});
}

// Close on click outside
function onClickOutside(event: MouseEvent) {
	const target = event.target as Node;
	if (
		triggerRef.value &&
		!triggerRef.value.contains(target) &&
		floatingRef.value &&
		!floatingRef.value.contains(target)
	) {
		closePopover();
	}
}

watch(isOpen, (open) => {
	if (open) {
		document.addEventListener("mousedown", onClickOutside);
	} else {
		document.removeEventListener("mousedown", onClickOutside);
	}
});
</script>

<template>
	<!-- LED pin (center) -->
	<template v-if="isLed">
		<button
			ref="triggerRef"
			class="group flex flex-col items-center gap-1"
			:aria-label="`Pin ${pin.id} ${pin.name}`"
			@click="togglePopover"
		>
			<div
				class="w-3 h-3 rounded-full border-2 border-gray-500 transition-colors cursor-pointer group-hover:ring-2 ring-primary bg-green-900"
				:class="{
					'bg-green-400 shadow-[0_0_10px_2px_rgba(134,239,172,0.7)]':
						pin.state === 'HIGH',
				}"
			/>
			<span
				class="text-xs text-background font-mono group-hover:text-primary transition-colors"
			>
				{{ pin.name }}
			</span>
		</button>
	</template>

	<!-- Regular pin (left/right) -->
	<template v-else>
		<button
			ref="triggerRef"
			:disabled="!isInteractive"
			@click="togglePopover"
		>
			<div
				class="flex items-center gap-2 group"
				:class="
					side === 'left'
						? 'flex-row-reverse justify-end'
						: 'flex-row justify-start'
				"
			>
				<span
					class="text-xs text-white font-mono transition-colors w-5 text-center"
					:class="{ 'group-hover:text-primary': isInteractive }"
				>
					{{ pin.id }}
				</span>
				<div
					class="w-3 h-3 rounded-full border-2 border-gray-500 transition-colors"
					:class="[
						isGpio ? 'bg-yellow-400' : 'bg-gray-600',
						isInteractive &&
							'cursor-pointer group-hover:ring-2 ring-primary',
					]"
				/>
			</div>
		</button>
	</template>

	<!-- Popover -->
	<Teleport to="body">
		<div
			v-if="isOpen && isInteractive"
			ref="floatingRef"
			:style="floatingStyles"
			class="z-50 w-64 rounded-lg border bg-popover text-popover-foreground shadow-md p-4 space-y-4"
		>
			<div class="flex justify-between items-center">
				<h4 class="font-bold">{{ pin.name }}</h4>
				<span
					v-if="isGpio"
					class="inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold bg-secondary text-secondary-foreground"
				>
					GPIO {{ pin.gpio }}
				</span>
			</div>

			<div class="h-px bg-border" />

			<div class="space-y-2">
				<p class="text-sm font-medium">Functions:</p>
				<div class="flex flex-wrap gap-1">
					<template v-if="pin.functions.length > 0">
						<span
							v-for="func in pin.functions"
							:key="func"
							class="inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold"
						>
							{{ func }}
						</span>
					</template>
					<p v-else class="text-xs text-muted-foreground">
						General Purpose I/O
					</p>
				</div>
			</div>

			<template v-if="isInteractive">
				<div class="h-px bg-border" />
				<div class="space-y-4">
					<!-- Mode toggle (hidden for LED) -->
					<div
						v-if="!isLed"
						class="flex items-center justify-between"
					>
						<label
							:for="`mode-switch-${pin.id}`"
							class="text-sm font-medium"
						>
							Mode: {{ pin.mode }}
						</label>
						<button
							:id="`mode-switch-${pin.id}`"
							class="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
							role="switch"
							:aria-checked="pin.mode === 'OUTPUT'"
							:aria-label="`Toggle pin ${pin.gpio} mode`"
							:class="
								pin.mode === 'OUTPUT'
									? 'bg-primary'
									: 'bg-input'
							"
							@click="handleModeChange"
						>
							<span
								class="pointer-events-none block h-5 w-5 rounded-full bg-background shadow-lg ring-0 transition-transform"
								:class="
									pin.mode === 'OUTPUT'
										? 'translate-x-5'
										: 'translate-x-0'
								"
							/>
						</button>
					</div>

					<!-- State toggle -->
					<div class="flex items-center justify-between">
						<label
							:for="`state-switch-${pin.id}`"
							class="text-sm font-medium"
							:class="{
								'text-muted-foreground':
									pin.mode === 'INPUT' && !isLed,
							}"
						>
							State: {{ pin.state }}
						</label>
						<button
							:id="`state-switch-${pin.id}`"
							class="relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
							role="switch"
							:aria-checked="pin.state === 'HIGH'"
							:aria-label="`Toggle pin ${pin.gpio || 'LED'} state`"
							:disabled="pin.mode === 'INPUT' && !isLed"
							:class="[
								pin.state === 'HIGH'
									? 'bg-primary'
									: 'bg-input',
								pin.mode === 'INPUT' && !isLed
									? 'cursor-not-allowed opacity-50'
									: 'cursor-pointer',
							]"
							@click="handleStateChange"
						>
							<span
								class="pointer-events-none block h-5 w-5 rounded-full bg-background shadow-lg ring-0 transition-transform"
								:class="
									pin.state === 'HIGH'
										? 'translate-x-5'
										: 'translate-x-0'
								"
							/>
						</button>
					</div>
				</div>
			</template>
		</div>
	</Teleport>
</template>
