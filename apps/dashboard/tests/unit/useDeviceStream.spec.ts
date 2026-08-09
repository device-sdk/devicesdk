import { ref, nextTick, createApp } from 'vue';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { flushPromises } from '@vue/test-utils';
import { useDeviceStream } from '@/composables/useDeviceStream';
import { logService } from '@/services/api.service';

/**
 * Runs a composable inside a real component setup scope so lifecycle hooks
 * (onUnmounted in useDeviceStream) register against an active instance
 * instead of warning "no active component instance".
 */
function withSetup<T>(composable: () => T): T {
  let result!: T;
  createApp({
    setup() {
      result = composable();
      return () => null;
    },
  }).mount(document.createElement('div'));
  return result;
}

vi.mock('@/services/api.service', () => ({
  logService: {
    getWatchUrl: vi.fn(
      (
        projectId: string,
        deviceId: string,
        options?: { backfillLimit?: number },
      ) => {
        const qs = options?.backfillLimit != null ? `?backfillLimit=${options.backfillLimit}` : '';
        return `ws://test/watch/${projectId}/${deviceId}${qs}`;
      },
    ),
  },
}));

vi.mock('@/lib/api', () => ({
  ApiError: class ApiError extends Error {},
  api: { call: vi.fn().mockResolvedValue(undefined) },
}));

class MockWebSocket {
  static instances: MockWebSocket[] = [];
  url: string;
  closed = false;
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent<string>) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  close() {
    this.closed = true;
  }

  emitOpen() {
    this.onopen?.(new Event('open'));
  }

  emitMessage(payload: unknown) {
    this.onmessage?.({ data: JSON.stringify(payload) } as MessageEvent<string>);
  }

  emitClose(code?: number) {
    this.onclose?.({ code } as CloseEvent);
  }
}

const logEntry = (id: string, message: string, created_at = 1000) => ({
  id,
  level: 'info',
  message,
  created_at,
});

describe('useDeviceStream', () => {
  beforeEach(() => {
    MockWebSocket.instances = [];
    vi.stubGlobal('WebSocket', MockWebSocket);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it('drops duplicate log ids within a single connection', () => {
    const stream = withSetup(() => useDeviceStream('proj-1', 'dev-1', { backfillLimit: 100 }));
    stream.connect();
    const ws = MockWebSocket.instances[0]!;
    ws.emitOpen();
    // A live frame racing its own backfill replay arrives twice with the same
    // id; only the first copy may land in the buffer.
    ws.emitMessage({ event: 'log', data: logEntry('log-1', 'hello') });
    ws.emitMessage({ event: 'log', data: logEntry('log-1', 'hello') });
    ws.emitMessage({ event: 'log', data: logEntry('log-2', 'world') });
    expect(stream.streamedLogs.value).toHaveLength(2);
    expect(stream.streamedLogs.value.map((l) => l.id)).toEqual(['log-2', 'log-1']);
  });

  it('accepts replayed ids on a fresh connection (per-connection dedupe)', () => {
    vi.useFakeTimers();
    const stream = withSetup(() => useDeviceStream('proj-1', 'dev-1', { backfillLimit: 100 }));
    stream.connect();
    let ws = MockWebSocket.instances[0]!;
    ws.emitOpen();
    ws.emitMessage({ event: 'log', data: logEntry('log-1', 'before drop') });
    expect(stream.streamedLogs.value).toHaveLength(1);

    // Drop the connection; the reconnect backfill replays the same id, which
    // must be accepted (it fills the gap since the previous connection).
    ws.emitClose();
    vi.advanceTimersByTime(1000);
    ws = MockWebSocket.instances[1]!;
    ws.emitOpen();
    ws.emitMessage({ event: 'log', data: logEntry('log-1', 'replayed') });
    expect(stream.streamedLogs.value).toHaveLength(2);
  });

  it('reconnects to the new ids and resets buffered data when the id refs change', async () => {
    const projectId = ref('proj-1');
    const deviceId = ref('dev-1');
    const stream = withSetup(() => useDeviceStream(projectId, deviceId, { backfillLimit: 100 }));
    stream.connect();
    let ws = MockWebSocket.instances[0]!;
    ws.emitOpen();
    ws.emitMessage({ event: 'log', data: logEntry('log-1', 'from dev-1') });
    ws.emitMessage({ event: 'status', data: { connected: true } });
    expect(stream.streamedLogs.value).toHaveLength(1);
    expect(stream.deviceStatus.value.connected).toBe(true);

    // The consumer navigated to another device while the stream stayed alive.
    projectId.value = 'proj-2';
    deviceId.value = 'dev-2';
    await nextTick();
    await flushPromises();

    expect(stream.streamedLogs.value).toHaveLength(0);
    expect(stream.deviceStatus.value.connected).toBe(false);
    ws = MockWebSocket.instances[1]!;
    expect(ws.url).toContain('/proj-2/dev-2');
  });

  it('drops the buffered logs when a device switch happens while disconnected', async () => {
    const projectId = ref('proj-1');
    const deviceId = ref('dev-1');
    const stream = withSetup(() => useDeviceStream(projectId, deviceId, { backfillLimit: 100 }));
    stream.connect();
    const ws = MockWebSocket.instances[0]!;
    ws.emitOpen();
    ws.emitMessage({ event: 'log', data: logEntry('log-1', 'from dev-1') });
    stream.disconnect();
    expect(stream.streamedLogs.value).toHaveLength(1);

    projectId.value = 'proj-2';
    deviceId.value = 'dev-2';
    await nextTick();
    await flushPromises();

    // Switch while disconnected still clears the old device's logs and opens
    // the new socket (the watch calls connect() itself).
    expect(stream.streamedLogs.value).toHaveLength(0);
    expect(MockWebSocket.instances).toHaveLength(2);
    expect(MockWebSocket.instances[1]!.url).toContain('/proj-2/dev-2');
  });
});
