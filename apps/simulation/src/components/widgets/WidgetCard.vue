<script setup lang="ts">
import { computed } from "vue";
import { WIDGET_BLUEPRINTS } from "@/composables/useDragDrop";
import type { WidgetInstance } from "@/stores/widgets";

const props = defineProps<{
	widget: WidgetInstance;
	selected: boolean;
}>();

const emit = defineEmits<{
	select: [];
	remove: [];
}>();

const blueprint = computed(() => WIDGET_BLUEPRINTS[props.widget.kind]);

const pinSummary = computed(() =>
	Object.entries(props.widget.pins)
		.map(([role, gpio]) =>
			role === "pin" ? `GPIO ${gpio}` : `${role}=GPIO ${gpio}`,
		)
		.join(" · "),
);
</script>

<template>
	<button
		type="button"
		class="w-full text-left flex items-center gap-3 rounded-md border p-3 transition-colors"
		:class="
			selected
				? 'border-primary bg-primary/5'
				: 'border-border hover:bg-accent/40'
		"
		@click="emit('select')"
	>
		<span
			class="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-secondary text-secondary-foreground text-sm font-bold"
		>
			{{ blueprint.glyph }}
		</span>
		<div class="flex-1 min-w-0">
			<div class="flex items-center justify-between gap-2">
				<span class="text-sm font-medium truncate">
					{{ blueprint.name }}
				</span>
				<button
					type="button"
					class="shrink-0 text-xs text-muted-foreground hover:text-destructive transition-colors"
					:aria-label="`Remove ${blueprint.name}`"
					@click.stop="emit('remove')"
				>
					✕
				</button>
			</div>
			<p class="text-[11px] text-muted-foreground font-mono truncate">
				{{ pinSummary }}
			</p>
		</div>
	</button>
</template>
