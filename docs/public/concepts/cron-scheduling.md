---
title: Cron Scheduling
description: Schedule recurring work in device scripts using cron expressions
social_image: /og-images/docs/concepts/cron-scheduling.png
---

Device scripts can define named cron schedules to run recurring tasks - polling a sensor, sending a heartbeat, or clearing a buffer - without any external scheduler.

## How It Works

Cron schedules are initialized when a device connects. The server evaluates each expression and schedules the next fire time. When a cron fires, `onCron` is called with the schedule's name. After each firing, the next occurrence is computed and scheduled automatically.

Crons are **connection-gated**: they start when the device connects and stop when it disconnects. A slot that comes due while the device is offline is **skipped, never caught up** - when the device reconnects, scheduling resumes from the next future slot.

## Defining Schedules

Add a `crons` property to your device class. Keys are arbitrary schedule names; values are standard 5-field cron expressions in UTC.

```typescript
import { DeviceEntrypoint } from "@devicesdk/core";

export default class TemperatureSensor extends DeviceEntrypoint {
  crons = {
    heartbeat: "*/5 * * * *",   // every 5 minutes
    dailyReport: "0 8 * * *",   // daily at 08:00 UTC
  };

  async onCron(name: string) {
    if (name === "heartbeat") {
      // read sensor, post to webhook, etc.
    }
    if (name === "dailyReport") {
      // send daily summary
    }
  }
}
```

## Cron Expression Format

Expressions use the standard 5-field format (all times in UTC):

```
minute  hour  day-of-month  month  day-of-week
0-59    0-23  1-31          1-12   0-6 (0=Sunday)
```

### Field Syntax

| Syntax | Example | Meaning |
|--------|---------|---------|
| `*` | `*` | Any value |
| `N` | `5` | Specific value |
| `*/N` | `*/15` | Every N units |
| `N-M` | `1-5` | Range (inclusive) |
| `N,M` | `0,30` | List of values |
| `N-M/S` | `0-30/10` | Range with step |

### Common Examples

| Expression | Schedule |
|------------|----------|
| `* * * * *` | Every minute |
| `*/5 * * * *` | Every 5 minutes |
| `0 * * * *` | Every hour (on the hour) |
| `0 8 * * *` | Daily at 08:00 UTC |
| `0 8 * * 1-5` | Weekdays at 08:00 UTC |
| `0 0 1 * *` | First day of every month |

## When Are Schedules Updated?

Cron definitions are read from your script once, when the device connects. If you change the `crons` property and redeploy, the new schedule takes effect on the **next device connection** (i.e., after the device reboots or reconnects). Running `devicesdk deploy` sends a reboot command to connected devices, so new crons take effect automatically after a deploy.

## Cron Expressions and Day-of-Week / Day-of-Month

When both `day-of-month` and `day-of-week` are restricted (not `*`), the cron fires on days that match **either** condition (OR semantics). For example, `0 8 1 * 1` fires at 08:00 UTC on the 1st of the month **and** every Monday.

## Limitations

- All cron times are in **UTC** - there is no timezone support in cron expressions.
- The minimum granularity is **1 minute** - sub-minute intervals are not supported.
- Crons only fire while the device is **connected**. If the device is offline when a cron was due, the missed fire is skipped; it does not catch up.
