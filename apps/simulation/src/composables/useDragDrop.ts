import { computed, ref } from "vue";
import type { BoardDef, PinDef } from "@/boards/types";
import type { WidgetKind } from "@/stores/widgets";

export interface WidgetBlueprint {
	kind: WidgetKind;
	name: string;
	description: string;
	category: "sensor" | "probe";
	glyph: string;
	validDropPins: (board: BoardDef, pinsInUse: Set<number>) => Set<number>;
}

export const WIDGET_BLUEPRINTS: Record<WidgetKind, WidgetBlueprint> = {
	button: {
		kind: "button",
		name: "Push Button",
		description: "Momentary digital input. Press, hold, or double-click.",
		category: "sensor",
		glyph: "●",
		validDropPins(board, pinsInUse) {
			const valid = new Set<number>();
			for (const pin of board.pins) {
				if (pin.gpio === null) continue;
				if (pin.attributes.includes("flash-reserved")) continue;
				if (pinsInUse.has(pin.gpio)) continue;
				valid.add(pin.gpio);
			}
			return valid;
		},
	},
};

const draggingKind = ref<WidgetKind | null>(null);
const validTargets = ref<Set<number>>(new Set());
const invalidTargets = ref<Set<number>>(new Set());

export function useDragDrop() {
	const isDragging = computed(() => draggingKind.value !== null);

	function startDrag(
		event: DragEvent,
		kind: WidgetKind,
		board: BoardDef,
		pinsInUse: Set<number>,
	) {
		draggingKind.value = kind;
		const blueprint = WIDGET_BLUEPRINTS[kind];
		const valid = blueprint.validDropPins(board, pinsInUse);
		validTargets.value = valid;

		const invalid = new Set<number>();
		for (const pin of board.pins) {
			if (pin.gpio !== null && !valid.has(pin.gpio)) invalid.add(pin.gpio);
		}
		invalidTargets.value = invalid;

		if (event.dataTransfer) {
			event.dataTransfer.effectAllowed = "copy";
			event.dataTransfer.setData("application/x-devicesdk-widget", kind);
		}
	}

	function endDrag() {
		draggingKind.value = null;
		validTargets.value = new Set();
		invalidTargets.value = new Set();
	}

	function canDropOnPin(pin: PinDef): boolean {
		if (pin.gpio === null) return false;
		return validTargets.value.has(pin.gpio);
	}

	function pendingKind(): WidgetKind | null {
		return draggingKind.value;
	}

	return {
		draggingKind,
		validTargets,
		invalidTargets,
		isDragging,
		startDrag,
		endDrag,
		canDropOnPin,
		pendingKind,
	};
}
