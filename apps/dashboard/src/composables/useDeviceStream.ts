import { ref, onUnmounted } from 'vue';
import { logService, type DeviceLog, type DeviceStatus } from '@/services/api.service';

export interface UseDeviceStreamOptions {
  /**
   * Request up to N recent log entries on connect as `{ event: "log", replay: true }`
   * frames before live events start arriving. Followed by a single
   * `{ event: "history_complete" }` marker that flips the returned
   * `historyLoaded` ref to `true`. Omitted → no backfill.
   */
  backfillLimit?: number;
  /** Optional log level filter applied to the backfill replay only. */
  backfillLevel?: string;
}

/**
 * Composable for streaming device logs and status via the watcher WebSocket.
 *
 * Auto-reconnects on disconnection with exponential backoff. When
 * `backfillLimit` is provided, replay frames (history) and live events are
 * delivered on the same socket - the dashboard's logs panel uses this to
 * avoid the HTTP `/logs` endpoint, which was deprecated in May 2026.
 *
 * Frame format: `{ event, data, replay? }`
 *   - event "status"           → connection state changes
 *   - event "log"              → log entry (replay=true for backfilled rows)
 *   - event "state"            → structured entity state updates
 *   - event "history_complete" → backfill replay finished; live mode begins
 */
export function useDeviceStream(
  projectId: string,
  deviceId: string,
  options: UseDeviceStreamOptions = {},
) {
  const streamedLogs = ref<DeviceLog[]>([]);
  const deviceStatus = ref<DeviceStatus>({ connected: false, connectedSince: null });
  /** True while the dashboard's watcher socket is open. */
  const streaming = ref(false);
  /** True while we're between connection attempts (backing off). */
  const reconnecting = ref(false);
  const historyLoaded = ref(false);

  let ws: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let reconnectDelay = 1000;
  // `unmounted` is the one-way latch set only when the component goes away - it
  // permanently kills the stream. `active` tracks whether a consumer *wants* a
  // connection right now: disconnect() flips it off (revivable) and connect()
  // flips it back on, so pause/resume works without recreating the composable.
  let unmounted = false;
  let active = false;

  // WebSocket close codes that mean "your session is no longer valid" - the
  // server rejected the upgrade for auth reasons. Mirrors lib/api.ts's 401
  // handling: stop retrying and bounce to login rather than reconnect forever
  // against a dead session.
  const AUTH_CLOSE_CODES = new Set([1008, 4401, 4403]);

  function connect() {
    if (unmounted) return;
    active = true;
    if (ws) {
      ws.onopen = ws.onmessage = ws.onerror = ws.onclose = null;
      ws.close();
      ws = null;
    }

    const url = logService.getWatchUrl(projectId, deviceId, options);
    // history_complete fires once per connection; reset on every reconnect so
    // consumers can show a "loading" indicator each time.
    historyLoaded.value = options.backfillLimit == null;
    const socket = new WebSocket(url);
    ws = socket;
    reconnecting.value = false;

    socket.onopen = () => {
      reconnectDelay = 1000;
      streaming.value = true;
    };

    socket.onmessage = (event) => {
      try {
        const frame = JSON.parse(event.data as string) as {
          event: string;
          data?: unknown;
          replay?: boolean;
        };
        if (frame.event === 'log') {
          const d = frame.data;
          if (
            d !== null &&
            typeof d === 'object' &&
            'id' in d && typeof (d as Record<string, unknown>).id === 'string' &&
            'level' in d && typeof (d as Record<string, unknown>).level === 'string' &&
            'message' in d && typeof (d as Record<string, unknown>).message === 'string' &&
            'created_at' in d && typeof (d as Record<string, unknown>).created_at === 'number'
          ) {
            const log = d as DeviceLog;
            // Replay frames arrive oldest-first; live frames arrive newest at
            // top. Newest-at-top is the display convention, so always prepend
            // and let the cap (500) shape the visible window.
            streamedLogs.value = [log, ...streamedLogs.value.slice(0, 499)];
          }
        } else if (frame.event === 'status') {
          const d = frame.data;
          if (
            d !== null &&
            typeof d === 'object' &&
            'connected' in d && typeof (d as Record<string, unknown>).connected === 'boolean'
          ) {
            deviceStatus.value = d as DeviceStatus;
          }
        } else if (frame.event === 'history_complete') {
          historyLoaded.value = true;
        }
        // event === 'state' is reserved for future UI features
      } catch {
        // Ignore malformed frames
      }
    };

    // A failed connection fires onerror *then* onclose; without a guard each
    // would schedule its own reconnect (leaking the first timer, which
    // disconnect() can then no longer cancel). Detach this socket's handlers on
    // the first call so we reconnect at most once per drop.
    const handleClose = (event?: CloseEvent) => {
      socket.onopen = socket.onmessage = socket.onerror = socket.onclose = null;
      if (ws === socket) ws = null;
      streaming.value = false;

      // Explicit auth-class close → session is dead. Stop retrying and bounce
      // to login (the API client does the same on a 401) instead of backing
      // off forever against a connection that will never succeed.
      if (event && AUTH_CLOSE_CODES.has(event.code)) {
        active = false;
        reconnecting.value = false;
        window.location.href = '/login?expired=true';
        return;
      }

      if (unmounted || !active || reconnectTimer) return;
      reconnecting.value = true;
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        connect();
      }, reconnectDelay);
      reconnectDelay = Math.min(reconnectDelay * 2, 30000);
    };

    socket.onerror = () => handleClose();
    socket.onclose = (event) => handleClose(event);
  }

  function disconnect() {
    // Transient stop: stop retrying and close the socket, but stay revivable -
    // a later connect() can resume the stream on the same composable instance.
    active = false;
    reconnecting.value = false;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (ws) {
      ws.onopen = ws.onmessage = ws.onerror = ws.onclose = null;
      ws.close();
      ws = null;
    }
    streaming.value = false;
  }

  function clearLogs() {
    streamedLogs.value = [];
  }

  onUnmounted(() => {
    unmounted = true;
    disconnect();
  });

  return {
    streamedLogs,
    deviceStatus,
    streaming,
    reconnecting,
    historyLoaded,
    connect,
    disconnect,
    clearLogs,
  };
}
