---
"@devicesdk/core": minor
"@devicesdk/cli": minor
---

Add cron-style scheduling for device scripts via `crons` property and `onCron()` lifecycle method.

Device scripts can now declare named cron schedules using standard 5-field cron expressions. The runtime automatically manages DO alarms to fire `onCron(name)` at the scheduled times.

```typescript
class MyDevice extends DeviceEntrypoint {
  crons = {
    heartbeat: '*/5 * * * *',    // every 5 minutes
    dailyReport: '0 8 * * *',   // every day at 08:00 UTC
  };

  async onCron(name: string) {
    if (name === 'heartbeat') {
      const reading = await this.env.DEVICE.i2cRead(0, '0x76', 6);
      console.info('Sensor:', reading);
    }
  }
}
```
