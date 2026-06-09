// Centralized API host resolution for the dashboard.
// Precedence: VITE_API_HOST env override > same-origin (PROD, served by the
// DeviceSDK server) > local dev default (server on :8080, quasar dev on :9000).
// Used by the api call wrapper, services/api.service stream URLs, and the
// auth flows. Keep this the single source of truth.

const resolveApiHost = (): string => {
  const envHost = import.meta.env.VITE_API_HOST as string | undefined;
  if (envHost) return envHost.replace(/\/$/, '');
  // Production builds are served same-origin by the DeviceSDK server.
  if (import.meta.env.PROD) return window.location.origin;
  return 'http://localhost:8080';
};

export const API_HOST = resolveApiHost();

// WebSocket counterpart (ws:// or wss:// depending on scheme).
export const WS_API_HOST = API_HOST.replace(/^http/, 'ws');
