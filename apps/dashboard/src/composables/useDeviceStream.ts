import { ref, watch, onUnmounted, type Ref } from 'vue';
import { ApiError, api } from '@/lib/api';
import { redirectToLogin } from '@/lib/redirect';
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
 * Upper bound on the per-connection log-id dedupe set. Mirrors the CLI's
 * seenIds mechanism in packages/cli/src/commands/logs.ts (which caps at 5000)
 * but with a smaller budget: only ids within a connection's backfill-replay
 * window can collide, so evicting the oldest beyond a generous cap never
 * produces a duplicate in practice.
 */
const MAX_SEEN_IDS = 2000;

/**
 * Composable for streaming device logs and status via the watcher WebSocket.
 *
 * Accepts either plain ids (captured at setup) or refs - pass `toRef(props, ...)`
 * so the stream follows the consumer to a different device when the ids change.
 * On an id change the buffered logs and status are reset and the socket is
 * re-opened for the new ids.
 *
 * Auto-reconnects on disconnection with exponential backoff. When
 * `backfillLimit` is provided, replay frames (history) and live events are
 * delivered on the same socket - the dashboard's logs panel uses this single
 * socket for both history and live tailing instead of paging the HTTP
 * `/logs` endpoint, which exists but only returns a point-in-time snapshot.
 *
 * Frame format: `{ event, data, replay? }`
 *   - event "status"           → connection state changes
 *   - event "log"              → log entry (replay=true for backfilled rows)
 *   - event "state"            → structured entity state updates
 *   - event "history_complete" → backfill replay finished; live mode begins
 */
export function useDeviceStream(
  projectIdSource: string | Ref<string>,
  deviceIdSource: string | Ref<string>,
  options: UseDeviceStreamOptions = {},
) {
  const projectId =
    typeof projectIdSource === 'string' ? ref(projectIdSource) : projectIdSource;
  const deviceId =
    typeof deviceIdSource === 'string' ? ref(deviceIdSource) : deviceIdSource;

  const streamedLogs = ref<DeviceLog[]>([]);
  const deviceStatus = ref<DeviceStatus>({
    connected: false,
    connectedSince: null,
    firmwareVersion: null,
    deviceType: null,
  });
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
  // Per-connection dedupe set (see connect()). Reset on every connect so the
  // reconnect backfill replay is always shown, while duplicates within a
  // single connection (the backfill/live race) are dropped.
  let seenIds = new Set<string>();
  let authProbeInFlight = false;
  // Latch so a reconnect storm during one outage probes auth exactly once
  // instead of hammering /v1/user/me on every failed-connect cycle. Reset only
  // on a successful onopen (the network is back); a 30s offline stretch stays
  // silent.
  let authProbed = false;

  // WebSocket close codes that mean "your session is no longer valid" - the
  // server rejected the upgrade for auth reasons. Mirrors lib/api.ts's 401
  // handling: stop retrying and bounce to login rather than reconnect forever
  // against a dead session.
  const AUTH_CLOSE_CODES = new Set([1008, 4401, 4403]);

  /**
   * The server rejects a failed watch upgrade with an HTTP 401 *before* the
   * WebSocket handshake, so the browser never receives a close code (1006 with
   * `socketOpened === false`). Probe the API once to distinguish a dead
   * session from a transient network failure; only a 401 stops the retry loop.
   */
  async function probeAuth() {
    if (authProbeInFlight || authProbed) return;
    authProbeInFlight = true;
    authProbed = true;
    try {
      await api.call('/v1/user/me', { suppressAuthRedirect: true });
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        active = false;
        reconnecting.value = false;
        if (reconnectTimer) {
          clearTimeout(reconnectTimer);
          reconnectTimer = null;
        }
        redirectToLogin();
      }
      // Network errors and anything else: not an auth failure, keep retrying.
    } finally {
      authProbeInFlight = false;
    }
  }

  function connect() {
    if (unmounted) return;
    active = true;
    if (ws) {
      ws.onopen = ws.onmessage = ws.onerror = ws.onclose = null;
      ws.close();
      ws = null;
    }

    // Read the ids at call time: connect() may be re-invoked after a device
    // switch, so the url must reflect the current ids, not setup-time values.
    const url = logService.getWatchUrl(projectId.value, deviceId.value, options);
    // history_complete fires once per connection; reset on every reconnect so
    // consumers can show a "loading" indicator each time.
    historyLoaded.value = options.backfillLimit == null;
    // Replay frames from this connection's backfill are new history (they fill
    // the gap since the previous connection); duplicates can only occur within
    // a single connection, so start the dedupe set fresh.
    seenIds = new Set();
    const socket = new WebSocket(url);
    ws = socket;
    reconnecting.value = false;
    let socketOpened = false;

    socket.onopen = () => {
      socketOpened = true;
      // A successful connection proves the network (and session) work - allow
      // the auth probe again so a *future* outage gets its own single probe.
      authProbed = false;
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
            // The server can replay a row that also arrived as a live frame
            // (or vice versa) within one connection; drop the duplicate.
            if (seenIds.has(log.id)) return;
            seenIds.add(log.id);
            if (seenIds.size > MAX_SEEN_IDS) {
              const oldest = seenIds.values().next().value;
              if (oldest !== undefined) seenIds.delete(oldest);
            }
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
            const status = d as Record<string, unknown>;
            const versionOk =
              status.firmwareVersion == null ||
              typeof status.firmwareVersion === 'string';
            const typeOk =
              status.deviceType == null || typeof status.deviceType === 'string';
            if (versionOk && typeOk) {
              deviceStatus.value = d as DeviceStatus;
            }
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
        redirectToLogin();
        return;
      }

      // A socket that dropped before it ever opened was rejected at upgrade
      // time - and an auth-rejected upgrade surfaces here as code 1006 with
      // no close code. Probe auth in the background; if the session is dead
      // the probe cancels the retry and redirects.
      if (!socketOpened) void probeAuth();

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

  // Follow the consumer to a different device (DeviceLogs stays mounted when
  // navigating between devices of the same route). Drop the previous device's
  // buffered logs and status, then re-open the socket for the new ids - the
  // backfill replay refills history for the new device.
  watch([projectId, deviceId], () => {
    streamedLogs.value = [];
    deviceStatus.value = { connected: false, connectedSince: null };
    disconnect();
    connect();
  });

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
