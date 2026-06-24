---
title: "Device API reference"
description: "Every method on this.env.DEVICE — GPIO, PWM, I2C, SPI, UART, KV, watchdog"
url: http://localhost:1313/docs/concepts/device-api/
---

# Device API reference

> Every method on this.env.DEVICE — GPIO, PWM, I2C, SPI, UART, KV, watchdog


This is a single-page reference of every method on `this.env.DEVICE`. The same surface is documented in JSDoc on `node_modules/@devicesdk/core/dist/index.d.ts` — your editor will surface it on hover and in completions. Use this page when you want a flat overview rather than chasing types.

> Pin numbering: every supported board exposes a virtual **pin 99** mapped to the onboard LED. Use it instead of chip-specific GPIOs to keep your code portable.

## GPIO

```typescript
await this.env.DEVICE.setGpioState(pin: number, state: "high" | "low"): Promise<void>
```

Drive a GPIO output. Use `99` for the onboard LED. Pico W GPIOs are 0–22, 26–28; ESP32 ranges depend on chip — see the [Pico pinout](/docs/hardware/pico-w/) and ESP32 hardware pages.

```typescript
await this.env.DEVICE.getPinState(pin: number, mode: "analog" | "digital"): Promise<DeviceResponse>
```

Read once. Resolves with a `pin_state_update` event whose `payload.value` is `"high" | "low"` for digital reads or a number 0..4095 for analog (Pico ADC).

```typescript
await this.env.DEVICE.configureGpioInputMonitoring(
  pin: number,
  enable: boolean,
  pull?: "up" | "down" | "none"
): Promise<void>
```

Subscribe to GPIO transitions. Each transition fires a `gpio_state_changed` event (handled in `onMessage`).

## PWM

```typescript
await this.env.DEVICE.setPwmState(pin: number, frequency: number, dutyCycle: number): Promise<void>
```

`dutyCycle` is **0..1**, not 0..100. Typical frequencies: 1000–25000 Hz for LEDs, 50 Hz for hobby servos.

## I2C

```typescript
await this.env.DEVICE.i2cConfigure(bus, sdaPin, sclPin, frequency?): Promise<void>
await this.env.DEVICE.i2cScan(bus: number): Promise<DeviceResponse>           // → i2c_scan_result
await this.env.DEVICE.i2cWrite(bus, address, data: string[]): Promise<void>
await this.env.DEVICE.i2cRead(bus, address, bytesToRead, registerToRead?): Promise<DeviceResponse>
                                                                                // → i2c_read_result
```

Addresses are hex strings (`"0x3C"`); data is an array of single-byte hex strings (`["0xAE", "0xD5"]`). See the [I2C guide](/docs/guides/using-i2c/) for batch writes and patterns.

## SPI

```typescript
await this.env.DEVICE.spiConfigure(
  bus, clkPin, mosiPin, misoPin, csPin, frequency, mode: 0 | 1 | 2 | 3
): Promise<void>
await this.env.DEVICE.spiTransfer(bus, data: string[]): Promise<DeviceResponse> // full-duplex
await this.env.DEVICE.spiWrite(bus, data: string[]): Promise<void>
await this.env.DEVICE.spiRead(bus, bytesToRead): Promise<DeviceResponse>
```

See the [SPI guide](/docs/guides/using-spi/).

## UART

```typescript
await this.env.DEVICE.uartConfigure(
  port, txPin, rxPin, baudRate,
  dataBits?: 5|6|7|8, stopBits?: 1|2, parity?: "none" | "even" | "odd"
): Promise<void>
await this.env.DEVICE.uartWrite(port, data: string[]): Promise<void>
await this.env.DEVICE.uartRead(port, bytesToRead, timeoutMs?): Promise<DeviceResponse>
```

See the [UART guide](/docs/guides/using-uart/).

## Addressable LEDs (WS2812 / NeoPixel — Pico)

```typescript
await this.env.DEVICE.pioWs2812Configure(pin: number, numLeds: number): Promise<void>
await this.env.DEVICE.pioWs2812Update(pixels: [number, number, number][]): Promise<void>
```

One `[r, g, b]` triplet per LED. Each channel is 0–255. See the [Addressable LEDs guide](/docs/guides/addressable-leds/).

## Watchdog

```typescript
await this.env.DEVICE.watchdogConfigure(timeoutMs: number, enable: boolean): Promise<void>
await this.env.DEVICE.watchdogFeed(): Promise<void>
```

Once enabled, the watchdog cannot be disabled until reboot. Call `watchdogFeed` within `timeoutMs` or the chip hard-resets.

## Onboard temperature

```typescript
await this.env.DEVICE.getTemperature(): Promise<DeviceResponse>   // → temperature_result
```

Reads the chip's built-in sensor. Less accurate than an external sensor (BME280, DS18B20). The [Discord temperature recipe](/docs/recipes/post-discord-webhook/) uses it.

## KV state

```typescript
this.env.DEVICE.kv.get<T>(key: string): Promise<T | undefined>
this.env.DEVICE.kv.put<T>(key: string, value: T): Promise<void>
this.env.DEVICE.kv.delete(key: string): Promise<boolean>
```

Per-device key/value storage. Persists across reconnects, deploys, and reboots. Values are JSON-serialised. See the [KV recipe](/docs/recipes/persist-counter-kv/).

## Logs and state events

```typescript
this.env.DEVICE.persistLog(level: string, message: string): Promise<void>
this.env.DEVICE.emitState(entityId: string, value: unknown): Promise<void>
```

`persistLog` writes a structured log entry visible in `devicesdk logs --tail` and the dashboard — but `console.log/info/warn/error` are captured automatically, so prefer those. `emitState` publishes telemetry to dashboard watchers and (if declared in `devicesdk.ts`) Home Assistant. See [Emit state](/docs/concepts/emit-state/).

## Reboot

```typescript
await this.env.DEVICE.reboot(): Promise<void>
```

Soft-reboot the device. Don't chain commands after this — they queue and fire on reconnect.

## Lower-level escape hatches

When a typed wrapper doesn't yet exist, you can emit raw commands:

```typescript
await this.env.DEVICE.sendCommand(command: Omit<DeviceCommand, "id">): Promise<void>
await this.env.DEVICE.sendCommandAndWait<T>(command: Omit<T, "id">): Promise<DeviceResponse>
```

Prefer the typed methods above whenever possible.

## Related

- [Device entrypoints](/docs/concepts/entrypoints/) — how methods on `DeviceEntrypoint` connect to this surface.
- [Cookbook](/docs/recipes/) — task-shaped recipes that use these methods.
- [Error reference](/docs/errors/) — what runtime errors look like.

