import { ESP32_DEVKITC } from "./esp32-devkitc/board";
import type { BoardDef } from "./types";

export const BOARDS: Record<string, BoardDef> = {
	[ESP32_DEVKITC.id]: ESP32_DEVKITC,
};

export const DEFAULT_BOARD_ID = ESP32_DEVKITC.id;

export function getBoard(id: string): BoardDef {
	const board = BOARDS[id];
	if (!board) throw new Error(`Unknown board: ${id}`);
	return board;
}

export { ESP32_DEVKITC };
export * from "./types";
