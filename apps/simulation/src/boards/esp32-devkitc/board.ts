import type { BoardDef, PinDef } from "../types";
import { describeFunctions, ESP32_CAPABILITIES } from "./capabilities";

type PinBlueprint = {
	gpio: number | null;
	kind: PinDef["kind"];
	label: string;
	shortLabel: string;
	extraFunctions?: string[];
	attributes?: PinDef["attributes"];
};

const LEFT: PinBlueprint[] = [
	{ gpio: null, kind: "power-3v3", label: "3V3", shortLabel: "3V3" },
	{ gpio: null, kind: "enable", label: "EN", shortLabel: "EN" },
	{
		gpio: 36,
		kind: "input-only",
		label: "GPIO36 (SVP)",
		shortLabel: "36",
		extraFunctions: ["SENSOR_VP"],
	},
	{
		gpio: 39,
		kind: "input-only",
		label: "GPIO39 (SVN)",
		shortLabel: "39",
		extraFunctions: ["SENSOR_VN"],
	},
	{ gpio: 34, kind: "input-only", label: "GPIO34", shortLabel: "34" },
	{ gpio: 35, kind: "input-only", label: "GPIO35", shortLabel: "35" },
	{ gpio: 32, kind: "gpio", label: "GPIO32", shortLabel: "32" },
	{ gpio: 33, kind: "gpio", label: "GPIO33", shortLabel: "33" },
	{ gpio: 25, kind: "gpio", label: "GPIO25", shortLabel: "25" },
	{ gpio: 26, kind: "gpio", label: "GPIO26", shortLabel: "26" },
	{ gpio: 27, kind: "gpio", label: "GPIO27", shortLabel: "27" },
	{ gpio: 14, kind: "gpio", label: "GPIO14", shortLabel: "14" },
	{ gpio: 12, kind: "gpio", label: "GPIO12", shortLabel: "12" },
	{ gpio: null, kind: "ground", label: "GND", shortLabel: "GND" },
	{ gpio: 13, kind: "gpio", label: "GPIO13", shortLabel: "13" },
	{
		gpio: 9,
		kind: "gpio",
		label: "GPIO9 (SD2)",
		shortLabel: "9",
		extraFunctions: ["SD_DATA2"],
	},
	{
		gpio: 10,
		kind: "gpio",
		label: "GPIO10 (SD3)",
		shortLabel: "10",
		extraFunctions: ["SD_DATA3"],
	},
	{
		gpio: 11,
		kind: "gpio",
		label: "GPIO11 (CMD)",
		shortLabel: "11",
		extraFunctions: ["SD_CMD"],
	},
	{ gpio: null, kind: "power-5v", label: "5V (VIN)", shortLabel: "5V" },
];

const RIGHT: PinBlueprint[] = [
	{ gpio: null, kind: "ground", label: "GND", shortLabel: "GND" },
	{ gpio: 23, kind: "gpio", label: "GPIO23", shortLabel: "23" },
	{ gpio: 22, kind: "gpio", label: "GPIO22", shortLabel: "22" },
	{ gpio: 1, kind: "gpio", label: "GPIO1 (TX0)", shortLabel: "TX" },
	{ gpio: 3, kind: "gpio", label: "GPIO3 (RX0)", shortLabel: "RX" },
	{ gpio: 21, kind: "gpio", label: "GPIO21", shortLabel: "21" },
	{ gpio: null, kind: "ground", label: "GND", shortLabel: "GND" },
	{ gpio: 19, kind: "gpio", label: "GPIO19", shortLabel: "19" },
	{ gpio: 18, kind: "gpio", label: "GPIO18", shortLabel: "18" },
	{ gpio: 5, kind: "gpio", label: "GPIO5", shortLabel: "5" },
	{ gpio: 17, kind: "gpio", label: "GPIO17", shortLabel: "17" },
	{ gpio: 16, kind: "gpio", label: "GPIO16", shortLabel: "16" },
	{ gpio: 4, kind: "gpio", label: "GPIO4", shortLabel: "4" },
	{
		gpio: 0,
		kind: "gpio",
		label: "GPIO0 (BOOT)",
		shortLabel: "0",
		attributes: ["boot-button"],
	},
	{
		gpio: 2,
		kind: "gpio",
		label: "GPIO2 (LED)",
		shortLabel: "2",
		attributes: ["builtin-led"],
	},
	{ gpio: 15, kind: "gpio", label: "GPIO15", shortLabel: "15" },
	{
		gpio: 8,
		kind: "gpio",
		label: "GPIO8 (SD1)",
		shortLabel: "8",
		extraFunctions: ["SD_DATA1"],
	},
	{
		gpio: 7,
		kind: "gpio",
		label: "GPIO7 (SD0)",
		shortLabel: "7",
		extraFunctions: ["SD_DATA0"],
	},
	{
		gpio: 6,
		kind: "gpio",
		label: "GPIO6 (CLK)",
		shortLabel: "6",
		extraFunctions: ["SD_CLK"],
	},
];

function buildPins(): PinDef[] {
	const pins: PinDef[] = [];
	let physical = 1;

	const addColumn = (column: PinBlueprint[], side: "left" | "right") => {
		column.forEach((blueprint, row) => {
			const attributes = [...(blueprint.attributes ?? [])];
			if (blueprint.gpio !== null) {
				const cap = ESP32_CAPABILITIES[blueprint.gpio];
				if (cap?.strapping) attributes.push("strapping");
				if (cap?.flashReserved) attributes.push("flash-reserved");
				if (cap?.uart?.port === 0) attributes.push("usb-serial");
			}
			const functions =
				blueprint.gpio !== null ? describeFunctions(blueprint.gpio) : [];
			if (blueprint.extraFunctions) {
				functions.unshift(...blueprint.extraFunctions);
			}
			pins.push({
				physical: physical++,
				gpio: blueprint.gpio,
				label: blueprint.label,
				shortLabel: blueprint.shortLabel,
				side,
				row,
				kind: blueprint.kind,
				attributes,
				functions,
			});
		});
	};

	addColumn(LEFT, "left");
	addColumn(RIGHT, "right");
	return pins;
}

export const ESP32_DEVKITC: BoardDef = {
	id: "esp32-devkitc",
	name: "ESP32 DevKit-C",
	description: "Espressif ESP32-WROOM-32 DevKit-C (38-pin)",
	pins: buildPins(),
	capabilities: ESP32_CAPABILITIES,
	defaultI2c: { sda: 21, scl: 22 },
	defaultSpi: { mosi: 23, miso: 19, clk: 18, cs: 5 },
	rowCount: Math.max(LEFT.length, RIGHT.length),
};

export function findPinByGpio(gpio: number): PinDef | undefined {
	return ESP32_DEVKITC.pins.find((p) => p.gpio === gpio);
}
