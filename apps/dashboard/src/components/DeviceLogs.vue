<template>
  <div>
    <div class="row items-center q-mb-md q-gutter-sm">
      <q-select
        v-model="levelFilter"
        :options="levelOptions"
        label="Level"
        outlined
        dense
        emit-value
        map-options
        style="min-width: 150px"
      />
      <q-space />
      <q-chip
        v-if="reconnecting"
        color="orange"
        text-color="white"
        size="sm"
        icon="sync"
      >
        Reconnecting…
      </q-chip>
      <q-chip
        :color="deviceStatus.connected ? 'green' : 'grey-6'"
        text-color="white"
        size="sm"
        icon="circle"
      >
        {{ deviceStatus.connected ? 'Online' : 'Offline' }}
      </q-chip>
      <q-btn flat icon="delete_sweep" aria-label="Clear logs" @click="clearLogs">
        <q-tooltip>Clear logs</q-tooltip>
      </q-btn>
    </div>

    <div v-if="!historyLoaded" class="text-center q-pa-xl">
      <q-spinner-dots color="primary" size="40px" />
      <div class="text-caption text-grey-6 q-mt-sm">Loading recent logs…</div>
    </div>

    <div v-else-if="filteredLogs.length === 0" class="text-center q-pa-xl">
      <q-icon name="article" size="64px" color="grey-4" class="q-mb-md" />
      <div class="text-h6 text-grey-6 q-mb-sm">No logs yet</div>
      <p class="text-body2 text-grey-5">
        Logs from console.log, console.warn, etc. in your device script will appear here in real time.
      </p>
    </div>

    <div v-else class="logs-container">
      <div
        v-for="log in renderedLogs"
        :key="log.id"
        class="log-entry row items-start q-py-xs q-px-sm"
      >
        <q-chip
          :color="levelColor(log.level)"
          text-color="white"
          size="xs"
          dense
          class="log-level-chip q-mr-sm"
        >
          {{ log.level }}
        </q-chip>
        <span class="text-grey-6 text-caption q-mr-sm log-timestamp">
          {{ log.time }}
        </span>
        <span class="font-mono log-message">{{ log.display }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useQuasar } from 'quasar';
import { useDeviceStream } from '@/composables/useDeviceStream';

const props = defineProps<{
  projectId: string;
  deviceId: string;
}>();

const $q = useQuasar();
const levelFilter = ref<string | null>(null);

// Logs are now WS-only. The watcher WebSocket sends up to `backfillLimit`
// recent entries on connect (replay frames) followed by `history_complete`,
// then live events. The legacy HTTP `/logs` endpoint returns 410 — see
// apps/api/src/durableObjects/lib/device.ts `getLogs` for the full incident
// write-up.
const {
  streamedLogs,
  deviceStatus,
  reconnecting,
  historyLoaded,
  connect,
  disconnect,
  clearLogs: clearStreamLogs,
} = useDeviceStream(props.projectId, props.deviceId, { backfillLimit: 100 });

const filteredLogs = computed(() => {
  if (!levelFilter.value) return streamedLogs.value;
  return streamedLogs.value.filter((log) => log.level === levelFilter.value);
});

// Precompute the display string + timestamp once per log (instead of parsing
// JSON and formatting dates for every row on every re-render).
const renderedLogs = computed(() =>
  filteredLogs.value.map((log) => ({
    id: log.id,
    level: log.level,
    time: formatTimestamp(log.created_at),
    display: formatMessage(log.message),
  })),
);

const levelOptions = [
  { label: 'All Levels', value: null },
  { label: 'Debug', value: 'debug' },
  { label: 'Info', value: 'info' },
  { label: 'Log', value: 'log' },
  { label: 'Warn', value: 'warn' },
  { label: 'Error', value: 'error' },
];

const levelColor = (level: string): string => {
  switch (level) {
    case 'debug': return 'grey-7';
    case 'info': return 'blue';
    case 'log': return 'green';
    case 'warn': return 'orange';
    case 'error': return 'red';
    default: return 'grey';
  }
};

const formatTimestamp = (ts: number): string => {
  const date = new Date(ts);
  const time = date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  // Prefix the date for backfilled entries that aren't from today, so old rows
  // aren't ambiguous when history spans multiple days.
  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  if (sameDay) return time;
  const day = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${day} ${time}`;
};

const formatMessage = (message: string): string => {
  try {
    const parsed = JSON.parse(message);
    if (Array.isArray(parsed)) {
      return parsed.map((item) => (typeof item === 'string' ? item : JSON.stringify(item))).join(' ');
    }
    return message;
  } catch {
    return message;
  }
};

const clearLogs = () => {
  $q.dialog({
    title: 'Clear logs?',
    message:
      'This clears the logs from this view. New logs keep streaming, and recent history reloads if the connection drops.',
    cancel: { label: 'Cancel', flat: true },
    ok: { label: 'Clear', color: 'negative', unelevated: true },
  }).onOk(() => {
    clearStreamLogs();
  });
};

onMounted(() => {
  connect();
});

onUnmounted(() => {
  disconnect();
});
</script>

<style lang="scss" scoped>
.logs-container {
  background: hsl(240, 10%, 8%);
  border-radius: 8px;
  padding: 0.5rem;
  max-height: 600px;
  overflow-y: auto;
}

.log-entry {
  border-bottom: 1px solid hsl(240, 5%, 15%);
  min-height: 32px;
  align-items: center;

  &:last-child {
    border-bottom: none;
  }
}

.log-level-chip {
  min-width: 48px;
  text-align: center;
}

.log-timestamp {
  white-space: nowrap;
  font-size: 0.75rem;
}

.log-message {
  font-size: 0.8125rem;
  line-height: 1.5;
  color: hsl(0, 0%, 85%);
  word-break: break-all;
}
</style>
