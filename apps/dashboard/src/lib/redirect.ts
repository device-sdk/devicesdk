const ALLOWED_HOSTNAMES = ['localhost', 'devicesdk.com'];
const ALLOWED_SUFFIX = '.devicesdk.com';

/**
 * Validates that a redirect URL points to an allowed destination.
 * Only allows localhost, devicesdk.com, and *.devicesdk.com subdomains.
 */
export function isAllowedRedirectUrl(redirectUrl: string): boolean {
  try {
    const url = new URL(redirectUrl);
    const h = url.hostname;
    return ALLOWED_HOSTNAMES.includes(h) || h.endsWith(ALLOWED_SUFFIX);
  } catch {
    return false;
  }
}
