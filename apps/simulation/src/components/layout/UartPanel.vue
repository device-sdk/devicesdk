<script setup lang="ts">
import { computed, ref } from "vue";
import { parseHexBytes, useUartStore } from "@/stores/uart";

const uart = useUartStore();

const PORTS = [0, 1, 2];

const selectedPort = ref(0);
const input = ref("");
const error = ref("");

const buffered = computed(() => uart.bufferedCount(selectedPort.value));

const PRESETS: Array<{ label: string; bytes: string }> = [
	{
		label: "Touch press (page 0, comp 1)",
		bytes: "65 00 00 01 01 FF FF FF",
	},
	{
		label: "Touch release (page 0, comp 1)",
		bytes: "67 00 00 01 00 FF FF FF",
	},
	{
		label: "get reply: 25",
		bytes: "32 35 FF FF FF",
	},
];

function applyPreset(bytes: string) {
	input.value = bytes;
	error.value = "";
}

function inject() {
	try {
		const bytes = parseHexBytes(input.value);
		if (bytes.length === 0) {
			error.value = "Enter at least one byte (hex pairs, e.g. 41 FF FF FF)";
			return;
		}
		uart.injectBytes(selectedPort.value, bytes);
		error.value = "";
		input.value = "";
	} catch (e) {
		error.value = e instanceof Error ? e.message : String(e);
	}
}
</script>

<template>
	<section class="space-y-2">
		<div class="flex items-center justify-between">
			<h3
				class="text-[10px] font-bold uppercase text-muted-foreground tracking-wider"
			>
				UART Injector
			</h3>
			<span class="text-[10px] text-muted-foreground">
				port {{ selectedPort }}: {{ buffered }} byte(s) buffered
			</span>
		</div>

		<div class="rounded-md border border-border bg-background p-2 space-y-2">
			<div class="flex items-center gap-1">
				<span class="text-[10px] text-muted-foreground">Port</span>
				<button
					v-for="p in PORTS"
					:key="p"
					type="button"
					class="h-6 w-8 rounded text-[10px] font-medium border transition-colors"
					:class="
						p === selectedPort
							? 'border-primary bg-primary/10 text-primary'
							: 'hover:bg-accent/40'
					"
					@click="selectedPort = p"
				>
					{{ p }}
				</button>
			</div>

			<div class="flex gap-1 flex-wrap">
				<button
					v-for="preset in PRESETS"
					:key="preset.label"
					type="button"
					class="rounded-md border px-1.5 h-6 text-[10px] font-medium hover:bg-accent/40 transition-colors"
					:title="preset.bytes"
					@click="applyPreset(preset.bytes)"
				>
					{{ preset.label }}
				</button>
			</div>

			<textarea
				v-model="input"
				rows="2"
				placeholder="Hex bytes, e.g. 41 42 FF FF FF"
				class="w-full rounded-md border border-input bg-background px-2 py-1 font-mono text-[11px] resize-none focus:outline-none focus:ring-1 focus:ring-primary"
				@keydown.ctrl.enter.prevent="inject"
			/>

			<div class="flex items-center gap-2">
				<button
					type="button"
					class="inline-flex items-center rounded-md text-[11px] font-medium h-6 px-2 border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-colors"
					@click="inject"
				>
					Inject
				</button>
				<button
					type="button"
					class="inline-flex items-center rounded-md text-[11px] font-medium h-6 px-2 border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-colors"
					:disabled="buffered === 0"
					:class="buffered === 0 ? 'opacity-40 pointer-events-none' : ''"
					@click="uart.clearBuffers"
				>
					Clear buffers
				</button>
			</div>

			<p v-if="error" class="text-[10px] text-red-600 dark:text-red-400">
				{{ error }}
			</p>
			<p class="text-[10px] text-muted-foreground">
				Injected bytes are returned to the script by the next
				<code class="font-mono">uart_read</code> on this port - useful for
				simulating request/response exchanges like Nextion
				<code class="font-mono">get</code> replies or touch frames.
			</p>
		</div>
	</section>
</template>
