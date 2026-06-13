const ALLOWED_HOSTNAMES = ['localhost', '127.0.0.1', 'devicesdk.com'];
const ALLOWED_SUFFIX = '.devicesdk.com';

function currentHostname(): string {
  if (typeof window === 'undefined') return '';
  return window.location.hostname;
}

/**
 * Validates that a redirect URL points to an allowed destination.
 * Allows the current dashboard origin (so self-hosters on custom domains work),
 * localhost/127.0.0.1, and *.devicesdk.com for backwards compatibility.
 */
export function isAllowedRedirectUrl(redirectUrl: string): boolean {
  try {
    const url = new URL(redirectUrl);
    const h = url.hostname;
    return (
      h === currentHostname() ||
      ALLOWED_HOSTNAMES.includes(h) ||
      h.endsWith(ALLOWED_SUFFIX)
    );
  } catch {
    return false;
  }
}
