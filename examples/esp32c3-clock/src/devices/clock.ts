import { DeviceEntrypoint } from "@devicesdk/core";
import { SSD1306 } from "@devicesdk/core/i2c";

// A wall clock for the ESP32-C3 board with the built-in 0.42" 72×40 OLED.
//
// The device script runs in the cloud, so it always knows the wall-clock time —
// the microcontroller itself has no real-time clock. Once a minute a cron fires,
// we format the current time + date for the configured timezone and push a fresh
// frame to the screen. Seconds are intentionally never shown: the display only
// changes once per minute, so there is nothing finer to render.
//
// Board wiring (common ESP32-C3 "FN4 / 0.42-inch OLED" DevKits):
//   On-board SSD1306 on I²C bus 0: SDA=5, SCL=6, addr 0x3C, 72×40, col offset 28.
//   `SSD1306.esp32c3OledVariant()` bakes in the width/height/offset for this panel.
//   Verify SDA/SCL against your board's silkscreen — a few variants swap them.

// IANA timezone for the displayed time. Change this to yours, e.g.
// "America/New_York", "Europe/London", "Asia/Tokyo". "UTC" is the safe default.
const TIMEZONE = "UTC";

const I2C_BUS = 0;
const I2C_SDA = 5;
const I2C_SCL = 6;

const OLED_WIDTH = 72;

// --- Big seven-segment digits, drawn with filled rectangles -----------------
// Each digit is DIGIT_W × DIGIT_H with SEG_T-thick segments. Segment order is
// the classic [a, b, c, d, e, f, g]:
//
//      aaa
//     f   b
//      ggg
//     e   c
//      ddd

const DIGIT_W = 13;
const DIGIT_H = 25;
const SEG_T = 3;
const TIME_Y = 1; // top of the digit row (leaves 1px above, line + date below)

// Layout for "HH:MM": two digit pairs separated by a colon, centred on the panel.
const TIME_GAP = 2; // gap between the two digits within HH (and within MM)
const COLON_GAP = 2; // gap on each side of the colon
const COLON_W = 4; // reserved width for the colon
const PAIR_W = 2 * DIGIT_W + TIME_GAP;
const CLOCK_W = 2 * PAIR_W + 2 * COLON_GAP + COLON_W;
const CLOCK_X = Math.max(0, Math.floor((OLED_WIDTH - CLOCK_W) / 2));

// Which segments light up for each digit 0-9, in [a, b, c, d, e, f, g] order.
const SEGMENTS: Record<string, boolean[]> = {
	"0": [true, true, true, true, true, true, false],
	"1": [false, true, true, false, false, false, false],
	"2": [true, true, false, true, true, false, true],
	"3": [true, true, true, true, false, false, true],
	"4": [false, true, true, false, false, true, true],
	"5": [true, false, true, true, false, true, true],
	"6": [true, false, true, true, true, true, true],
	"7": [true, true, true, false, false, false, false],
	"8": [true, true, true, true, true, true, true],
	"9": [true, true, true, true, false, true, true],
};

function drawDigit(display: SSD1306, x: number, char: string): void {
	const segs = SEGMENTS[char];
	if (!segs) return;
	const [a, b, c, d, e, f, g] = segs;

	const vLen = (DIGIT_H - 3 * SEG_T) / 2; // length of each vertical segment
	const midY = TIME_Y + SEG_T + vLen; // top of the middle (g) segment
	const innerW = DIGIT_W - 2 * SEG_T; // length of the horizontal segments
	const rx = x + DIGIT_W - SEG_T; // x of the right-hand verticals

	if (a) display.drawRect(x + SEG_T, TIME_Y, innerW, SEG_T, true);
	if (f) display.drawRect(x, TIME_Y + SEG_T, SEG_T, vLen, true);
	if (b) display.drawRect(rx, TIME_Y + SEG_T, SEG_T, vLen, true);
	if (g) display.drawRect(x + SEG_T, midY, innerW, SEG_T, true);
	if (e) display.drawRect(x, midY + SEG_T, SEG_T, vLen, true);
	if (c) display.drawRect(rx, midY + SEG_T, SEG_T, vLen, true);
	if (d)
		display.drawRect(x + SEG_T, TIME_Y + DIGIT_H - SEG_T, innerW, SEG_T, true);
}

// Default 5×7 font cells are 6px wide (5 + 1px spacing); centre a string on the panel.
const centerX = (text: string): number =>
	Math.max(0, Math.floor((OLED_WIDTH - (text.length * 6 - 1)) / 2));

function drawClockFace(display: SSD1306, time: string, date: string): void {
	display.clear();

	// time is "HH:MM" — render the four digits, skipping the ":" at index 2.
	const d2x = CLOCK_X + DIGIT_W + TIME_GAP;
	const colonX = CLOCK_X + PAIR_W + COLON_GAP;
	const d3x = colonX + COLON_W + COLON_GAP;
	const d4x = d3x + DIGIT_W + TIME_GAP;

	drawDigit(display, CLOCK_X, time[0]);
	drawDigit(display, d2x, time[1]);
	drawDigit(display, d3x, time[3]);
	drawDigit(display, d4x, time[4]);

	// Colon: two square dots straddling the middle of the digit row.
	display.drawRect(colonX, TIME_Y + 7, SEG_T, SEG_T, true);
	display.drawRect(colonX, TIME_Y + 14, SEG_T, SEG_T, true);

	// Separator + date line beneath the time.
	display.drawLine(
		0,
		TIME_Y + DIGIT_H + 1,
		OLED_WIDTH - 1,
		TIME_Y + DIGIT_H + 1,
	);
	display.drawText(centerX(date), TIME_Y + DIGIT_H + 5, date);
}

// Format the current instant for `timeZone` into a "HH:MM" time (24-hour, no
// seconds) and an "WED 28 MAY"-style date. `Intl` carries the timezone + locale
// rules so we never do manual offset math.
function formatClock(timeZone: string): { time: string; date: string } {
	const parts = new Intl.DateTimeFormat("en-US", {
		timeZone,
		hourCycle: "h23",
		weekday: "short",
		month: "short",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
	}).formatToParts(new Date());

	const get = (type: string): string =>
		parts.find((p) => p.type === type)?.value ?? "";

	const time = `${get("hour")}:${get("minute")}`;
	const date = `${get("weekday")} ${get("day")} ${get("month")}`.toUpperCase();
	return { time, date };
}

export class ClockDevice extends DeviceEntrypoint {
	// Redraw once a minute (standard 5-field cron, UTC). Seconds are never shown,
	// so a per-minute tick is all the resolution the display needs.
	crons = { tick: "* * * * *" };

	private display = SSD1306.esp32c3OledVariant({ bus: I2C_BUS });

	async onDeviceConnect() {
		console.info("Clock connected");

		await this.env.DEVICE.sendCommand({
			type: "i2c_configure",
			payload: {
				bus: I2C_BUS,
				sda_pin: I2C_SDA,
				scl_pin: I2C_SCL,
				frequency: 400000,
			},
		});

		// onDeviceConnect is the first hook after a fresh (re)connect — the device
		// just booted, so the OLED needs its one-time power-on init sequence. Draw
		// immediately too, so the screen isn't blank until the first cron tick.
		await this.updateDisplay({ init: true });
	}

	async onCron(_name: string) {
		// The panel was already initialized on connect this session; just redraw.
		await this.updateDisplay({ init: false });
	}

	async onDeviceDisconnect() {
		console.info("Clock disconnected");
	}

	private async updateDisplay({ init }: { init: boolean }) {
		const { time, date } = formatClock(TIMEZONE);
		drawClockFace(this.display, time, date);
		console.info(`Clock → ${time}  ${date}  (${TIMEZONE})`);

		await this.env.DEVICE.sendCommand(
			this.display.toDisplayCommand({ init, compress: false }),
		);
	}
}
