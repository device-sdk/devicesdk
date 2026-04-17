// Centralized API host resolution for the dashboard.
// Precedence: VITE_API_HOST env override > PROD default > local dev default.
// Used by axios boot, lib/api call wrapper, services/api.service stream URLs,
// and the auth store's OAuth redirect builder. Keep this the single source of truth.

const resolveApiHost = (): string => {
  const envHost = import.meta.env.VITE_API_HOST as string | undefined;
  if (envHost) return envHost.replace(/\/$/, '');
  return import.meta.env.PROD
    ? 'https://api.devicesdk.com'
    : 'http://localhost:8787';
};

export const API_HOST = resolveApiHost();

// WebSocket counterpart (ws:// or wss:// depending on scheme).
export const WS_API_HOST = API_HOST.replace(/^http/, 'ws');
