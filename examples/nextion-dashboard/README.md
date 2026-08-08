# nextion-dashboard

A DeviceSDK example that turns an **ESP32 with a Nextion serial HMI display**
into a live dashboard. The device script updates text components on the panel
(time, onboard temperature, uptime) over UART.

```
┌───────────────────────────────┐
│  DeviceSDK                    │  ← tTitle
│  14:32:05                     │  ← tTime      (updated every 5s)
│  27.3 C                       │  ← tTemp
│  12m 34s                      │  ← tUptime
└───────────────────────────────┘
```

## How it works

The screen design (pages, text components) is created in the **Nextion
Editor** on a PC and flashed to the panel as a `.tft` file. The device script
then drives the components over UART with the `NextionDisplay` driver from
`@devicesdk/core` - no hand-built hex byte arrays, the mandatory
`0xFF 0xFF 0xFF` frame terminator is handled for you.

```
        cron "*/5 * * * * *"             uart_write (ASCII + FF FF FF)
 ┌────────────┐   fires    ┌────────────┐  page 0, tTime.txt="…"   ┌─────────┐
 │  Device    │  every 5s ►│  Device    │  ──────────────────────► │ ESP32   │
 │  Script    │            │  Script    │                          │  UART2  │
 │  (server)  │ ◄───────── │  formats   │  ◄────────────────────── └─────────┤
 └────────────┘  onCron()  │  the data  │      (no reads in this example)   │
                           └────────────┘                                    │
                                                                Nextion panel
```

- The script runs on the server, so it always knows the wall-clock time.
- `crons = { uptime: "*/5 * * * * *" }` fires `onCron` every 5 seconds, which
  pushes the current time, the onboard temperature, and the uptime to the
  panel's text components.
- A first frame is drawn in `onDeviceConnect` so the screen is never blank.

**Touch is not yet supported** - receiving touch events needs an event-driven
UART receive path on the firmware (planned Phase 2). See
`docs/designs/nextion-dev-experience.md` in the repo root.

## Setup

### 1. Design and flash the Nextion screen

1. Create a project in the Nextion Editor with page 0 containing text
   components named `tTitle`, `tTime`, `tTemp`, and `tUptime`.
2. Set the baud rate to **115200** (Project settings).
3. Flash the compiled `.tft` to the panel over serial or microSD.

### 2. Wire it up

| Nextion | ESP32 DevKit |
|---------|--------------|
| RX | GPIO17 (UART2 TX) |
| TX | GPIO16 (UART2 RX) |
| VIN | 5V (external supply for bigger panels) |
| GND | GND |

### 3. Install, deploy, flash

```bash
pnpm install
# set your WiFi credentials in devicesdk.ts
pnpm deploy
pnpm flash-remote     # or: pnpm flash-local
```

## Notes

- If the panel shows garbage or the `comok` boot string never arrives, the
  panel's baud rate differs from `UART_BAUD` in `src/devices/dashboard.ts`.
- The simulator (`pnpm dev`) answers `get_temperature` and `uart_*` commands
  with mock data; the UART panel lets you inject raw bytes into a port's
  receive buffer to exercise request/response logic without hardware.

The full source is [`src/devices/dashboard.ts`](./src/devices/dashboard.ts).
