/**
 * Builds the human-readable firmware label for a device.
 *
 * Prefers the live status fields (null = legacy firmware that does not report
 * a version) and falls back to the persisted last-known values, then to a
 * plain "Unknown".
 */
export function formatFirmwareLabel(
  firmwareVersion: string | null | undefined,
  deviceType: string | null | undefined,
): string {
  const version = firmwareVersion ?? null;
  const type = deviceType ?? null;
  if (version && type) return `${version} · ${type}`;
  if (version) return version;
  if (type) return type;
  return 'Unknown';
}
