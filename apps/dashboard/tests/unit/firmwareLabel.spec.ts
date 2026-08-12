import { describe, expect, it } from 'vitest';
import { formatFirmwareLabel } from '@/lib/firmwareLabel';

describe('formatFirmwareLabel', () => {
  it('combines version and type with a middle dot', () => {
    expect(formatFirmwareLabel('0.2.0', 'esp32c3')).toBe('0.2.0 · esp32c3');
  });

  it('shows the version when the type is unknown', () => {
    expect(formatFirmwareLabel('0.2.0', null)).toBe('0.2.0');
    expect(formatFirmwareLabel('0.2.0', undefined)).toBe('0.2.0');
  });

  it('shows the type when the version is unknown', () => {
    expect(formatFirmwareLabel(null, 'pico-w')).toBe('pico-w');
    expect(formatFirmwareLabel(undefined, 'pico-w')).toBe('pico-w');
  });

  it('shows the type when the version is an empty string', () => {
    expect(formatFirmwareLabel('', 'pico-w')).toBe('pico-w');
  });

  it('shows the version when the type is an empty string', () => {
    expect(formatFirmwareLabel('0.2.0', '')).toBe('0.2.0');
  });

  it('falls back to Unknown for legacy firmware', () => {
    expect(formatFirmwareLabel(null, null)).toBe('Unknown');
    expect(formatFirmwareLabel(undefined, undefined)).toBe('Unknown');
  });
});
