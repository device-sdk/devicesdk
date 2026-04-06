import { ref, onUnmounted } from 'vue';
import { logService, type DeviceLog, type DeviceStatus } from '@/services/api.service';

/**
 * Composable for streaming real-time device logs and status via SSE.
 * Auto-reconnects on disconnection with exponential backoff.
 */
export function useDeviceStream(projectId: string, deviceId: string) {
  const streamedLogs = ref<DeviceLog[]>([]);
  const deviceStatus = ref<DeviceStatus>({ connected: false, connectedSince: null });
  const streaming = ref(false);

  let eventSource: EventSource | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let reconnectDelay = 1000;

  function connect() {
    if (eventSource) {
      eventSource.close();
    }

    const url = logService.getStreamUrl(projectId, deviceId);
    eventSource = new EventSource(url, { withCredentials: true });
    streaming.value = true;
    reconnectDelay = 1000;

    // Default message event = log entries
    eventSource.onmessage = (event) => {
      try {
        const log: DeviceLog = JSON.parse(event.data);
        streamedLogs.value = [log, ...streamedLogs.value.slice(0, 499)];
      } catch {
        // Ignore malformed events
      }
    };

    // Named event: device connection status changes
    eventSource.addEventListener('status', (event) => {
      try {
        deviceStatus.value = JSON.parse(event.data);
      } catch {
        // Ignore malformed status events
      }
    });

    eventSource.onerror = () => {
      streaming.value = false;
      eventSource?.close();
      eventSource = null;
      // Exponential backoff reconnect (max 30s)
      reconnectTimer = setTimeout(() => {
        connect();
      }, reconnectDelay);
      reconnectDelay = Math.min(reconnectDelay * 2, 30000);
    };
  }

  function disconnect() {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (eventSource) {
      eventSource.close();
      eventSource = null;
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
