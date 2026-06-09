import { describe, expect, it } from 'vitest';
import {
  buildDeviceMessagesOption,
  buildProjectMessagesOption,
  formatBytes,
  formatCount,
  formatDuration,
} from '@/lib/metricsFormat';
import type {
  ProjectDeviceMetrics,
  UsageBucket,
} from '@/services/api.service';

const bucket = (over: Partial<UsageBucket>): UsageBucket => ({
  ts: 0,
  messages_in: 0,
  messages_out: 0,
  bytes_in: 0,
  bytes_out: 0,
  cron_fires: 0,
  connected_seconds: 0,
  ...over,
});

describe('metrics formatting', () => {
  it('formatCount uses compact suffixes', () => {
    expect(formatCount(42)).toBe('42');
    expect(formatCount(1500)).toBe('1.5k');
    expect(formatCount(3_400_000)).toBe('3.4M');
    expect(formatCount(2_000_000_000)).toBe('2.0B');
  });

  it('formatBytes scales base-1000', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1500)).toBe('1.5 KB');
    expect(formatBytes(2_500_000)).toBe('2.5 MB');
  });

  it('formatDuration picks a coarse unit', () => {
    expect(formatDuration(30)).toBe('30s');
    expect(formatDuration(90)).toBe('1.5m');
    expect(formatDuration(3600)).toBe('1.0h');
    expect(formatDuration(172_800)).toBe('2.0d');
  });
});

describe('chart option builders', () => {
  it('device chart has received and sent series with [ts, value] points', () => {
    const option = buildDeviceMessagesOption([
      bucket({ ts: 1000, messages_in: 5, messages_out: 2 }),
    ]);
    const series = option.series as Array<{ name: string; data: number[][] }>;
    expect(series.map((s) => s.name)).toEqual(['Received', 'Sent']);
    expect(series[0]!.data).toEqual([[1000, 5]]);
    expect(series[1]!.data).toEqual([[1000, 2]]);
  });

  it('project chart emits one line per device summing in+out', () => {
    const devices: ProjectDeviceMetrics[] = [
      {
        device_id: 'dev-a',
        name: 'Sensor A',
        totals: bucket({}),
        series: [bucket({ ts: 1000, messages_in: 3, messages_out: 4 })],
      },
      {
        device_id: 'dev-b',
        name: null,
        totals: bucket({}),
        series: [bucket({ ts: 1000, messages_in: 1, messages_out: 1 })],
      },
    ];
    const option = buildProjectMessagesOption(devices);
    const series = option.series as Array<{ name: string; data: number[][] }>;
    expect(series).toHaveLength(2);
    // Falls back to device_id when name is null.
    expect(series.map((s) => s.name)).toEqual(['Sensor A', 'dev-b']);
    expect(series[0]!.data).toEqual([[1000, 7]]);
  });
});
