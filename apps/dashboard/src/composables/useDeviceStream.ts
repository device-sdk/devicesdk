import { ref, onUnmounted } from 'vue';
import { logService, type DeviceLog, type DeviceStatus } from '@/services/api.service';

/**
 * Composable for streaming real-time device logs and status via the generic
 * watch WebSocket. Auto-reconnects on disconnection with exponential backoff.
 *
 * Each frame arrives as JSON of the form `{ event, data }`:
 *   - event "status" → connection state changes
 *   - event "log"    → log entries
 *   - event "state"  → structured entity state updates (reserved for future UI)
 */
export function useDeviceStream(projectId: string, deviceId: string) {
  const streamedLogs = ref<DeviceLog[]>([]);
  const deviceStatus = ref<DeviceStatus>({ connected: false, connectedSince: null });
  const streaming = ref(false);

  let ws: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let reconnectDelay = 1000;
  let disposed = false;

  function connect() {
    if (disposed) return;
    if (ws) {
      ws.close();
      ws = null;
    }

    const url = logService.getWatchUrl(projectId, deviceId);
    ws = new WebSocket(url);
    streaming.value = true;

    ws.onopen = () => {
      // Reset backoff once the upgrade succeeds
      reconnectDelay = 1000;
    };

    ws.onmessage = (event) => {
      try {
        const frame = JSON.parse(event.data as string) as { event: string; data: unknown };
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
        }
        // event === 'state' is reserved for future UI features
      } catch {
        // Ignore malformed frames
      }
    };

    const handleClose = () => {
      streaming.value = false;
      ws = null;
      if (disposed) return;
      reconnectTimer = setTimeout(() => {
        connect();
      }, reconnectDelay);
      reconnectDelay = Math.min(reconnectDelay * 2, 30000);
    };

    ws.onerror = handleClose;
    ws.onclose = handleClose;
  }

  function disconnect() {
    disposed = true;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (ws) {
      ws.close();
      ws = null;
    }
    streaming.value = false;
  }

  function clearLogs() {
    streamedLogs.value = [];
  }

  onUnmounted(() => {
    disconnect();
  });

  return {
    streamedLogs,
    deviceStatus,
    streaming,
    connect,
    disconnect,
    clearLogs,
  };
}
