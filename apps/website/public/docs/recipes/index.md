---
title: "Cookbook"
description: "Task-shaped recipes — one URL per how-to, complete runnable code"
---

# Cookbook

> Task-shaped recipes — one URL per how-to, complete runnable code


Each recipe is a single page with a working `devicesdk.ts` and one device file. Copy, adapt, deploy.

## Sensors and inputs

- [Read a BME280 temperature/humidity sensor (I2C)](read-bme280/)
- [Toggle an LED with a button](button-toggles-led/)

## Outputs

- [Drive a WS2812 strip with a rainbow](ws2812-rainbow/)
- [Show live data on a small OLED](oled-live-data/)

## Persistence and scheduling

- [Persist a counter across reboots (KV)](persist-counter-kv/)
- [Send a daily summary on cron](daily-cron-summary/)

## External services

- [Post sensor readings to a Discord webhook](post-discord-webhook/)
- [Surface a sensor as a Home Assistant entity](sensor-to-home-assistant/)

## Multi-device

- [Two devices talking to each other (RPC)](two-devices-rpc/)

## Observability

- [Watch a device's state and logs in real time](watch-device-logs/)


## Pages in this section

- [How do I read a BME280 temperature/humidity sensor on a Pico?](http://localhost:1313/docs/recipes/read-bme280/index.md) — I2C-based BME280 driver — configure the bus, read the chip ID, log readings on a cron
- [How do I toggle an LED with a button?](http://localhost:1313/docs/recipes/button-toggles-led/index.md) — Wire a button to an input pin, watch transitions, drive the onboard LED
- [How do I persist a counter across device reboots?](http://localhost:1313/docs/recipes/persist-counter-kv/index.md) — Use this.env.DEVICE.kv to keep state across reboots, deploys, and reconnects
- [How do I send a daily summary on a cron schedule?](http://localhost:1313/docs/recipes/daily-cron-summary/index.md) — Declare a UTC cron, accumulate values in KV, post a summary once per day
- [How do I drive a WS2812 strip with a rainbow effect?](http://localhost:1313/docs/recipes/ws2812-rainbow/index.md) — Configure the strip on the Pico's PIO, animate a slow hue shift via cron
- [How do I show live data on a small OLED?](http://localhost:1313/docs/recipes/oled-live-data/index.md) — Wire an SSD1306 OLED, render text, update once a minute from a sensor read
- [How do I post sensor readings to a Discord webhook?](http://localhost:1313/docs/recipes/post-discord-webhook/index.md) — Read the chip temperature on a cron, POST to a webhook, handle non-2xx responses
- [How do I surface a sensor as a Home Assistant entity?](http://localhost:1313/docs/recipes/sensor-to-home-assistant/index.md) — Declare HA entities in devicesdk.ts, push values with emitState, consume via the HA integration
- [How do I make two devices talk to each other?](http://localhost:1313/docs/recipes/two-devices-rpc/index.md) — Use this.env.DEVICES["other"].method() — typed RPC mediated by the runtime
- [How do I watch a device's state and logs in real time?](http://localhost:1313/docs/recipes/watch-device-logs/index.md) — Stream live logs and structured state via devicesdk logs --tail or the watch WebSocket
