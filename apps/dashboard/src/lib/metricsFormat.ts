// Pure formatting helpers and ECharts option builders for the usage-metrics
// panels. Kept free of Vue/DOM so they are trivially unit-testable and the
// device/project panels can't drift in how they render the same numbers.

import type { EChartsOption } from 'echarts';
import type {
  ProjectDeviceMetrics,
  UsageBucket,
} from '@/services/api.service';

/** Compact integer-ish count: 1234 → "1.2k", 3_400_000 → "3.4M". */
export function formatCount(n: number): string {
  if (n < 1000) return String(Math.round(n));
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`;
  if (n < 1_000_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  return `${(n / 1_000_000_000).toFixed(1)}B`;
}

/** Human bytes: 1536 → "1.5 KB". Base-1000 to match the per-GB pricing model. */
export function formatBytes(n: number): string {
  if (n < 1000) return `${Math.round(n)} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = n / 1000;
  let i = 0;
  while (value >= 1000 && i < units.length - 1) {
    value /= 1000;
    i++;
  }
  return `${value.toFixed(1)} ${units[i]}`;
}


/** Format seconds as a coarse duration: 3600 → "1.0h", 90 → "1.5m". */
export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${(seconds / 60).toFixed(1)}m`;
  if (seconds < 86_400) return `${(seconds / 3600).toFixed(1)}h`;
  return `${(seconds / 86_400).toFixed(1)}d`;
}

// Shared chart scaffolding - a time x-axis with a compact-count y-axis.
function timeSeriesBase(): EChartsOption {
  return {
    grid: { top: 40, right: 16, bottom: 32, left: 56 },
    tooltip: { trigger: 'axis' },
    legend: { top: 0 },
    xAxis: { type: 'time' },
    yAxis: {
      type: 'value',
      axisLabel: { formatter: (v: number) => formatCount(v) },
    },
  };
}

/** Device line chart: inbound vs outbound messages over the window. */
export function buildDeviceMessagesOption(series: UsageBucket[]): EChartsOption {
  return {
    ...timeSeriesBase(),
    series: [
      {
        name: 'Received',
        type: 'line',
        showSymbol: false,
        smooth: true,
        areaStyle: { opacity: 0.08 },
        data: series.map((b) => [b.ts, b.messages_in]),
      },
      {
        name: 'Sent',
        type: 'line',
        showSymbol: false,
        smooth: true,
        areaStyle: { opacity: 0.08 },
        data: series.map((b) => [b.ts, b.messages_out]),
      },
    ],
  };
}

/**
 * Project chart: one line per device of total messages (in + out) per bucket,
 * so the heaviest consumers stand out.
 */
export function buildProjectMessagesOption(
  devices: ProjectDeviceMetrics[],
): EChartsOption {
  return {
    ...timeSeriesBase(),
    legend: { top: 0, type: 'scroll' },
    series: devices.map((d) => ({
      name: d.name || d.device_id,
      type: 'line',
      showSymbol: false,
      smooth: true,
      data: d.series.map((b) => [b.ts, b.messages_in + b.messages_out]),
    })),
  };
}

