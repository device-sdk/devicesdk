<script setup lang="ts">
import type { LogEntry } from "@/lib/types";

defineProps<{
	logs: LogEntry[];
}>();
</script>

<template>
	<div class="flex flex-col h-full">
		<h2 class="text-lg font-semibold mb-2 px-1">Event Log</h2>
		<div class="flex-grow rounded-md border p-4 bg-muted/20 overflow-y-auto">
			<div class="space-y-4">
				<p
					v-if="logs.length === 0"
					class="text-sm text-muted-foreground"
				>
					No events yet. Interact with a pin to start.
				</p>
				<div
					v-for="(log, index) in logs"
					:key="index"
					class="flex gap-4 text-sm animate-fade-in"
				>
					<span class="font-mono text-muted-foreground shrink-0">{{
						log.timestamp
					}}</span>
					<div class="h-auto w-px bg-border shrink-0" />
					<span class="flex-1 text-foreground">{{ log.message }}</span>
				</div>
			</div>
		</div>
	</div>
</template>
