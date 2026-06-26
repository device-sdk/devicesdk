# esp32c3-clock

A DeviceSDK example that turns an **ESP32-C3 board with the built-in 0.42" OLED**
(72×40 SSD1306) into a date-and-time wall clock. The display refreshes **once a
minute** - seconds are never shown.

```
 ┌──────────────────┐
 │   ##  ##  ##  ##  │   ← big seven-segment HH:MM
 │   ## :##  ## :##  │
 │ ──────────────── │
 │    WED 28 MAY     │   ← weekday / day / month
 └──────────────────┘
```

## How it works

The microcontroller has no real-time clock, but your device script runs on the
server - so it always knows the wall-clock time.

```
        cron "* * * * *"            display_update
 ┌────────────┐  fires once   ┌────────────┐  (HH:MM + date)   ┌──────────┐
 │  Device    │  a minute  ►  │  Device    │  ───────────────► │ ESP32-C3 │
 │  Script    │               │  Script    │                   │  OLED    │
 │  (server)  │ ◄──────────── │  formats   │                   └──────────┘
 └────────────┘   onCron()    │  the time  │
                              └────────────┘
```

- `crons = { tick: "* * * * *" }` fires `onCron` every minute (UTC).
- `onCron` formats the current instant for your timezone with `Intl.DateTimeFormat`
  and pushes a fresh frame to the OLED.
- The **time** is drawn as large seven-segment digits (filled rectangles) so it's
  readable across the room; the **date** uses the bundled 5×7 font.
- A first frame is drawn in `onDeviceConnect` so the screen is never blank while
  waiting for the first tick.

The full source is [`src/devices/clock.ts`](./src/devices/clock.ts).

## Setup

### 1. Install dependencies

```bash
pnpm install
```

### 2. Set your timezone

Open `src/devices/clock.ts` and change the `TIMEZONE` constant to your
[IANA timezone](https://en.wikipedia.org/wiki/List_of_tz_database_time_zones),
e.g. `"America/New_York"`, `"Europe/London"`, or `"Asia/Tokyo"`. It defaults to
`"UTC"`.

### 3. Configure WiFi

Edit `devicesdk.ts` and replace the `YOUR_WIFI_SSID` / `YOUR_WIFI_PASSWORD`
placeholders with the network your board will join.

### 4. Deploy

```bash
pnpm deploy
```

### 5. Flash your ESP32-C3

Plug the board in over USB and run:

```bash
pnpm flash-remote
```

The board joins your WiFi, connects to DeviceSDK, and shows the time within a
minute (and immediately on connect).

## Hardware notes

- Targets the common ESP32-C3 **"FN4 / 0.42-inch OLED"** DevKits, which carry an
  on-board 72×40 SSD1306 on **I²C bus 0, SDA = GPIO 5, SCL = GPIO 6, address
  `0x3C`**. The 72×40 glass sits at **column offset 28** in the controller's
  128-wide RAM - `SSD1306.esp32c3OledVariant()` bakes all of this in.
- A few board variants swap SDA/SCL or use a different column offset (30/32).
  If the screen is blank or shifted, check the silkscreen and adjust `I2C_SDA`,
  `I2C_SCL`, or use a plain `new SSD1306({ ..., columnOffset })`.

## Customizing

- **Update interval** - change `crons = { tick: "* * * * *" }`. Standard 5-field
  cron in UTC. `"*/5 * * * *"` would update every 5 minutes instead.
- **12-hour clock** - swap `hourCycle: "h23"` for `"h12"` in `formatClock`, and
  optionally append the `dayPeriod` part (AM/PM).
- **Date format** - the date line is built from the `weekday` / `day` / `month`
  parts in `formatClock`; reorder or drop fields to taste (it must stay under
  ~12 characters to fit the 72px width at the default font).
- **Digit size** - tune `DIGIT_W`, `DIGIT_H`, and `SEG_T`; the layout re-centres
  automatically.

## See also

- [Quickstart](https://devicesdk.com/docs/quickstart/)
- [Device Entrypoints](https://devicesdk.com/docs/concepts/entrypoints/)
- [Cookbook](https://devicesdk.com/docs/recipes/)
