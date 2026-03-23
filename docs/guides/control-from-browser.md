---
title: Control from Browser
description: "Use the DeviceSDK REST API to control ESP32 or Raspberry Pi Pico hardware directly from a browser — no server required. Toggle GPIO pins, read sensors, and more with plain JavaScript."
social_image: /og-images/docs/guides/control-from-browser.png
---

One of DeviceSDK's key advantages is that your device logic runs in the cloud — which means you can trigger it from anywhere that can make an HTTP request, including a plain browser page.

This guide shows how to build a minimal web UI that toggles a GPIO pin on your device using the DeviceSDK REST API.

## How It Works

DeviceSDK exposes a REST API for interacting with deployed projects and devices. You can use this from:
- A browser (plain HTML + JavaScript)
- A mobile app
- Another server
- Any HTTP client

The device script receives a custom message from your browser and responds by controlling hardware.

```
Browser (fetch) → DeviceSDK REST API → Cloud script → WebSocket → Device (GPIO)
```

## Prerequisites

- A deployed DeviceSDK project with a connected device ([Quickstart](/docs/quickstart/))
- An API token from your [dashboard](https://dash.devicesdk.com) (Settings → API Tokens)
- Your `project-id` and `device-id` (visible in the dashboard)

## Step 1: Add a Message Handler to Your Script

Update your device script to handle a custom `toggle_led` message:

```typescript
import { DeviceEntrypoint, type DeviceResponse } from '@devicesdk/core';

const LED_PIN = 25; // Pico W — use 2 for ESP32

export default class BrowserControlDevice extends DeviceEntrypoint {
  private ledState = false;

  async onDeviceConnect() {
    console.log('Device ready for browser control');
    await this.env.DEVICE.setGpioState(LED_PIN, 'low');
  }

  async onMessage(message: DeviceResponse) {
    if (message.type === 'custom' && message.payload.action === 'toggle_led') {
      this.ledState = !this.ledState;
      await this.env.DEVICE.setGpioState(LED_PIN, this.ledState ? 'high' : 'low');
      console.log(`LED is now ${this.ledState ? 'ON' : 'OFF'}`);
    }
  }
}
```

Deploy the updated script:

```bash
npx @devicesdk/cli deploy
```

## Step 2: Call the API from the Browser

The DeviceSDK REST API lets you send a message to a specific device. Here's the simplest possible browser page:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Device Control</title>
  <style>
    body { font-family: sans-serif; display: flex; flex-direction: column; align-items: center; padding: 2rem; }
    button { padding: 1rem 2rem; font-size: 1.25rem; cursor: pointer; margin-top: 1rem; }
    #status { margin-top: 1rem; color: #666; }
  </style>
</head>
<body>
  <h1>Hardware Control</h1>
  <button id="toggleBtn">Toggle LED</button>
  <p id="status">Ready</p>

  <script>
    const API_BASE = 'https://api.devicesdk.com';
    const API_TOKEN = 'dsdk_YOUR_TOKEN_HERE';   // Replace with your API token
    const PROJECT_ID = 'your-project-id';        // Replace with your project ID
    const DEVICE_ID  = 'your-device-id';         // Replace with your device ID

    document.getElementById('toggleBtn').addEventListener('click', async () => {
      const status = document.getElementById('status');
      status.textContent = 'Sending...';

      try {
        const response = await fetch(
          `${API_BASE}/v1/projects/${PROJECT_ID}/devices/${DEVICE_ID}/message`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${API_TOKEN}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              type: 'custom',
              payload: { action: 'toggle_led' }
            })
          }
        );

        if (response.ok) {
          status.textContent = 'Done! ✓';
        } else {
          const err = await response.json();
          status.textContent = `Error: ${err.error}`;
        }
      } catch (e) {
        status.textContent = `Network error: ${e.message}`;
      }
    });
  </script>
</body>
</html>
```

Open this HTML file directly in your browser (no web server needed for local testing). Click **Toggle LED** and your hardware responds.

## Sending Data with Messages

You can include arbitrary data in the `payload`. For example, to set a specific brightness:

```javascript
// Browser
body: JSON.stringify({
  type: 'custom',
  payload: { action: 'set_brightness', value: 0.75 }
})
```

```typescript
// Device script
async onMessage(message: DeviceResponse) {
  if (message.type === 'custom' && message.payload.action === 'set_brightness') {
    const duty = message.payload.value as number;
    await this.env.DEVICE.setPwmState(LED_PIN, 1000, duty);
  }
}
```

## Reading Sensor Data

To read a sensor value from the browser, you can store the latest reading in the device script and expose it via the KV store, or use a periodic logging pattern. The simplest approach is to log readings and fetch recent logs via the API.

Alternatively, write the reading to a KV variable and poll it from the browser:

```typescript
// Device script — store latest temperature reading
async onDeviceConnect() {
  setInterval(async () => {
    const result = await this.env.DEVICE.getTemperature();
    if (result.type === 'temperature_result') {
      await this.env.VARS.put('last_temp', String(result.payload.celsius));
    }
  }, 5000);
}
```

```javascript
// Browser — poll the value
const resp = await fetch(`${API_BASE}/v1/projects/${PROJECT_ID}/vars/last_temp`, {
  headers: { 'Authorization': `Bearer ${API_TOKEN}` }
});
const data = await resp.json();
console.log(`Temperature: ${data.result.value}°C`);
```

## Security Considerations

**Never embed API tokens in public web pages.** The example above is for local development or private networks only.

For a publicly accessible web UI:

1. **Build a backend** — keep your API token server-side and proxy requests through your own server
2. **Use short-lived tokens** — generate per-session tokens with limited permissions
3. **Restrict by origin** — configure CORS on your own proxy to limit which domains can call it

The DeviceSDK API token has full access to your project — treat it like a password.

## CORS

The DeviceSDK API supports CORS for browser requests. You can call `api.devicesdk.com` directly from the browser without a proxy. The `Authorization` header is allowed by the CORS policy.

## Complete Example: Dashboard with Multiple Controls

A more complete browser control panel:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Device Dashboard</title>
  <style>
    body { font-family: sans-serif; max-width: 600px; margin: 2rem auto; padding: 0 1rem; }
    .controls { display: flex; gap: 1rem; flex-wrap: wrap; margin-top: 1rem; }
    button { padding: 0.75rem 1.5rem; border-radius: 0.5rem; border: none; cursor: pointer; font-size: 1rem; }
    .btn-red { background: #ef4444; color: white; }
    .btn-green { background: #22c55e; color: white; }
    .btn-blue { background: #3b82f6; color: white; }
    .btn-off { background: #6b7280; color: white; }
    #log { margin-top: 1rem; font-size: 0.875rem; color: #6b7280; height: 6rem; overflow-y: auto; }
  </style>
</head>
<body>
  <h1>Device Control</h1>
  <div class="controls">
    <button class="btn-red"   onclick="sendColor(255,0,0)">Red</button>
    <button class="btn-green" onclick="sendColor(0,255,0)">Green</button>
    <button class="btn-blue"  onclick="sendColor(0,0,255)">Blue</button>
    <button class="btn-off"   onclick="sendColor(0,0,0)">Off</button>
  </div>
  <div id="log"></div>

  <script>
    const API_BASE   = 'https://api.devicesdk.com';
    const API_TOKEN  = 'dsdk_YOUR_TOKEN_HERE';
    const PROJECT_ID = 'your-project-id';
    const DEVICE_ID  = 'your-device-id';

    function log(msg) {
      const el = document.getElementById('log');
      el.textContent = `${new Date().toLocaleTimeString()} ${msg}\n` + el.textContent;
    }

    async function sendColor(r, g, b) {
      log(`Sending color (${r},${g},${b})...`);
      const resp = await fetch(
        `${API_BASE}/v1/projects/${PROJECT_ID}/devices/${DEVICE_ID}/message`,
        {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${API_TOKEN}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'custom', payload: { action: 'set_color', r, g, b } })
        }
      );
      log(resp.ok ? 'OK ✓' : `Error ${resp.status}`);
    }
  </script>
</body>
</html>
```

Corresponding device script for an ESP32-C61 or Pico with a WS2812 LED:

```typescript
import { DeviceEntrypoint, type DeviceResponse } from '@devicesdk/core';

export default class ColorControl extends DeviceEntrypoint {
  async onDeviceConnect() {
    await this.env.DEVICE.pioWs2812Configure(8, 1); // GPIO 8, 1 LED
  }

  async onMessage(message: DeviceResponse) {
    if (message.type === 'custom' && message.payload.action === 'set_color') {
      const { r, g, b } = message.payload as { r: number; g: number; b: number };
      await this.env.DEVICE.pioWs2812Update([[r, g, b]]);
    }
  }
}
```

## Next Steps

- [Platform Architecture](/docs/concepts/architecture/) — understand the full cloud ↔ device flow
- [Device Entrypoints](/docs/concepts/entrypoints/) — `onDeviceConnect` and `onMessage` in depth
- [Environment Variables](/docs/concepts/env-vars/) — store API tokens and secrets securely
- [Hardware Compatibility](/docs/resources/hardware/) — full feature matrix for ESP32 and Pico
