import { API_HOST } from '@/config/apiHost';

const API_BASE_URL = API_HOST;

/**
 * Rich error thrown by the API client. Lets callers distinguish *why* a request
 * failed so they can show the right UX:
 *   - `isNetworkError` → the request never reached the server (offline, DNS,
 *     CORS, server down). Show a "can't reach the server" / retry affordance,
 *     not a validation-style message.
 *   - `status` (HTTP code) → the server responded with an error. `message` is
 *     the server's own error text where available, so the UI can surface
 *     actionable detail (e.g. "project slug already taken") instead of a
 *     generic "Failed to …".
 */
export class ApiError extends Error {
  readonly status: number | null;
  readonly data: unknown;
  readonly isNetworkError: boolean;

  constructor(
    message: string,
    opts: { status?: number | null; data?: unknown; isNetworkError?: boolean } = {},
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = opts.status ?? null;
    this.data = opts.data;
    this.isNetworkError = opts.isNetworkError ?? false;
  }

  get isAuthError(): boolean {
    return this.status === 401 || this.status === 403;
  }
}

type ApiCallOptions = RequestInit & {
  /**
   * Suppress the automatic redirect-to-login on a 401. Used by the initial
   * auth probe (`/v1/user/me` on page load), where a 401 just means "not
   * logged in" and should be handled by the caller, not trigger a redirect.
   */
  suppressAuthRedirect?: boolean;
};

async function call<T>(path: string, options?: ApiCallOptions): Promise<T> {
  const url = `${API_BASE_URL}${path}`;
  const { suppressAuthRedirect, ...fetchOptions } = options ?? {};

  const finalOptions: RequestInit = {
    credentials: 'include',
    ...fetchOptions,
    headers: {
      'Content-Type': 'application/json',
      ...fetchOptions.headers,
    },
  };

  let response: Response;
  try {
    response = await fetch(url, finalOptions);
  } catch (error) {
    // fetch only rejects for network-level failures (offline, DNS, CORS,
    // aborted). Re-throw AbortError untouched so callers can ignore it; wrap
    // everything else as a network ApiError with a friendly message.
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error;
    }
    console.error(`API call to ${path} failed (network):`, error);
    throw new ApiError(
      'Unable to reach the server. Check your connection and try again.',
      { isNetworkError: true },
    );
  }

  if (!response.ok) {
    // Session expired - redirect to login instead of showing a generic error.
    // Skipped for the initial auth probe (suppressAuthRedirect), where a 401
    // is expected when the user is simply not logged in.
    if (response.status === 401 && !suppressAuthRedirect) {
      window.location.href = '/login?expired=true';
      // Return a never-resolving promise so callers don't continue.
      return new Promise<never>(() => {});
    }

    let errorData: unknown;
    try {
      errorData = await response.json();
    } catch {
      // Not a JSON response
    }

    throw new ApiError(extractErrorMessage(errorData, response.statusText), {
      status: response.status,
      data: errorData,
    });
  }

  if (response.status === 204) {
    return null as T;
  }

  const data = await response.json();
  return data as T;
}

/** Pull the most specific human-readable message out of an API error body. */
function extractErrorMessage(errorData: unknown, fallback: string): string {
  const body = errorData as
    | { errors?: unknown; message?: unknown; error?: unknown }
    | undefined;
  if (body && Array.isArray(body.errors) && body.errors.length > 0) {
    return body.errors
      .map((e: { message?: string } | string) =>
        typeof e === 'string' ? e : (e.message ?? 'Unknown error'),
      )
      .join('; ');
  }
  if (body && typeof body.message === 'string') return body.message;
  if (body && typeof body.error === 'string') return body.error;
  return fallback || 'API request failed';
}

export const api = {
  call,
};
