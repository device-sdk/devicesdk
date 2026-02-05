import { describe, it, expect } from 'vitest';
import { DeviceSDKConfigSchema, defineConfig, type DeviceSDKConfig } from './config';

describe('DeviceSDKConfigSchema', () => {
  it('should validate a correct config', () => {
    const config = {
      projectId: 'my-project',
      devices: {
        'temperature-sensor': {
          entrypoint: 'TemperatureSensorDevice',
          main: './devices/temperatureSensor.ts',
          deviceType: 'pico-w',
          name: 'Temperature Sensor',
          description: 'Monitors room temperature',
          wifi: { ssid: 'ssid', password: 'pass' },
        },
      },
    };
    const result = DeviceSDKConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  it('should validate config with minimal device properties', () => {
    const config = {
      projectId: 'my-project',
      devices: {
        'sensor': {
          entrypoint: 'SensorDevice',
          main: './devices/sensor.ts',
          deviceType: 'pico2-w',
          wifi: { ssid: 'ssid', password: 'pass' },
        },
      },
    };
    const result = DeviceSDKConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  it('should validate config with esp32 device type', () => {
    const config = {
      projectId: 'my-project',
      devices: {
        'esp-sensor': {
          entrypoint: 'EspDevice',
          main: './devices/esp.ts',
          deviceType: 'esp32',
          wifi: { ssid: 'ssid', password: 'pass' },
        },
      },
    };
    const result = DeviceSDKConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  it('should fail validation for a config with missing projectId', () => {
    const config = {
      devices: {
        'temperature-sensor': {
          main: './devices/temperatureSensor.ts',
          deviceType: 'pico-w',
          wifi: { ssid: 'ssid', password: 'pass' },
        },
      },
    };
    const result = DeviceSDKConfigSchema.safeParse(config);
    expect(result.success).toBe(false);
  });

  it('should fail validation for a config with missing main or entrypoint', () => {
    const config = {
      projectId: 'my-project',
      devices: {
        'temperature-sensor': {
          name: 'Temperature Sensor',
          deviceType: 'pico-w',
          wifi: { ssid: 'ssid', password: 'pass' },
        },
      },
    };
    const result = DeviceSDKConfigSchema.safeParse(config);
    expect(result.success).toBe(false);
  });

  it('should fail validation for invalid projectId format', () => {
    const config = {
      projectId: 'Invalid_Project',
      devices: {},
    };
    const result = DeviceSDKConfigSchema.safeParse(config);
    expect(result.success).toBe(false);
  });

  it('should validate a config with an empty devices object', () => {
    const config = {
      projectId: 'my-project',
      devices: {},
    };
    const result = DeviceSDKConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  it('defineConfig should return the config with main field', () => {
    const config: DeviceSDKConfig = {
      projectId: 'my-project',
      devices: {
        'sensor': {
          entrypoint: 'MySensor',
          main: './devices/sensor.ts',
          deviceType: 'pico-w',
          wifi: { ssid: 'ssid', password: 'pass' },
        },
      },
    };
    const result = defineConfig(config);
    expect(result.devices['sensor'].main).toBe('./devices/sensor.ts');
  });

  it('should support backward compatibility with entrypoint field', () => {
    const config = {
      projectId: 'my-project',
      devices: {
        'sensor': {
          entrypoint: './devices/sensor.ts',
          deviceType: 'pico-w',
          wifi: { ssid: 'ssid', password: 'pass' },
        },
      },
    };
    const result = DeviceSDKConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.devices['sensor'].main).toBe('./devices/sensor.ts');
    }
  });
});
