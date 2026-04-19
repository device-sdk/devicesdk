<script setup lang="ts">
import { ref } from "vue";

const collapsed = ref(true);
</script>

<template>
	<section
		class="flex flex-col bg-card text-card-foreground border-t"
		:class="collapsed ? 'h-10' : 'h-40'"
	>
		<header class="flex items-center justify-between px-3 h-10 border-b">
			<div class="flex items-center gap-2">
				<button
					type="button"
					class="text-xs text-muted-foreground hover:text-foreground"
					@click="collapsed = !collapsed"
				>
					{{ collapsed ? "▸" : "▾" }}
				</button>
				<h2 class="text-sm font-semibold">Pin Timeline</h2>
				<span class="text-[10px] text-muted-foreground uppercase tracking-wider">
					Phase 3
				</span>
			</div>
		</header>
		<div
			v-if="!collapsed"
			class="flex-1 flex items-center justify-center text-xs text-muted-foreground italic"
		>
			Oscilloscope-style pin activity coming soon — GPIO transitions, PWM duty,
			ADC traces.
		</div>
	</section>
</template>
