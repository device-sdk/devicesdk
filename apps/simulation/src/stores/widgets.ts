import { defineStore } from "pinia";
import { computed, ref } from "vue";

export type WidgetKind = "button";

export interface WidgetInstance {
	id: string;
	kind: WidgetKind;
	pins: Record<string, number>;
	config: Record<string, unknown>;
	/** Offset from board center, in px — for floating card layout */
	offset?: { x: number; y: number };
}

export const useWidgetsStore = defineStore("widgets", () => {
	const placed = ref<WidgetInstance[]>([]);
	const selectedId = ref<string | null>(null);

	const selected = computed(
		() => placed.value.find((w) => w.id === selectedId.value) ?? null,
	);

	function place(instance: Omit<WidgetInstance, "id">): WidgetInstance {
		const widget: WidgetInstance = { id: crypto.randomUUID(), ...instance };
		placed.value.push(widget);
		selectedId.value = widget.id;
		return widget;
	}

	function remove(id: string) {
		placed.value = placed.value.filter((w) => w.id !== id);
		if (selectedId.value === id) selectedId.value = null;
	}

	function select(id: string | null) {
		selectedId.value = id;
	}

	function update(id: string, patch: Partial<Omit<WidgetInstance, "id">>) {
		const w = placed.value.find((x) => x.id === id);
		if (!w) return;
		Object.assign(w, patch);
	}

	function findByPin(gpio: number): WidgetInstance[] {
		return placed.value.filter((w) => Object.values(w.pins).includes(gpio));
	}

	function pinsInUse(): Set<number> {
		const set = new Set<number>();
		for (const w of placed.value) {
			for (const g of Object.values(w.pins)) set.add(g);
		}
		return set;
	}

	return {
		placed,
		selectedId,
		selected,
		place,
		remove,
		select,
		update,
		findByPin,
		pinsInUse,
	};
});
