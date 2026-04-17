<script setup lang="ts">
import { computed } from "vue";
import ScriptPinsPanel from "@/components/layout/ScriptPinsPanel.vue";
import ButtonWidget from "@/components/widgets/sensors/ButtonWidget.vue";
import WidgetCard from "@/components/widgets/WidgetCard.vue";
import { useWidgetsStore } from "@/stores/widgets";

const widgets = useWidgetsStore();

const selected = computed(() => widgets.selected);

function removeWidget(id: string) {
	widgets.remove(id);
}
</script>

<template>
	<aside
		class="flex flex-col h-full bg-card text-card-foreground border-l overflow-y-auto"
	>
		<div class="p-3 border-b">
			<h2 class="text-sm font-semibold">Placed Widgets</h2>
			<p class="text-[11px] text-muted-foreground">
				{{ widgets.placed.length }} attached
			</p>
		</div>

		<div class="p-3 space-y-2">
			<p
				v-if="widgets.placed.length === 0"
				class="text-xs text-muted-foreground italic text-center py-4"
			>
				Drag a sensor from the palette onto a board pin.
			</p>
			<WidgetCard
				v-for="w in widgets.placed"
				:key="w.id"
				:widget="w"
				:selected="selected?.id === w.id"
				@select="widgets.select(w.id)"
				@remove="removeWidget(w.id)"
			/>
		</div>

		<div v-if="selected" class="p-4 border-t">
			<ButtonWidget
				v-if="selected.kind === 'button'"
				:key="selected.id"
				:widget="selected"
			/>
		</div>

		<div class="p-3 border-t">
			<ScriptPinsPanel />
		</div>
	</aside>
</template>
