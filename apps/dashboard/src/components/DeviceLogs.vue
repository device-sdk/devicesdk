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
        :color="deviceStatus.connected ? 'green' : 'grey-6'"
        text-color="white"
        size="sm"
        icon="circle"
      >
        {{ deviceStatus.connected ? 'Online' : 'Offline' }}
      </q-chip>
      <q-btn flat icon="delete_sweep" @click="clearLogs">
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

    <div v-else ref="logsContainer" class="logs-container">
      <div
        v-for="log in filteredLogs"
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
          {{ formatTimestamp(log.created_at) }}
        </span>
        <span class="font-mono log-message">{{ formatMessage(log.message) }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useDeviceStream } from '@/composables/useDeviceStream';

const props = defineProps<{
  projectId: string;
  deviceId: string;
}>();

const levelFilter = ref<string | null>(null);

// Logs are now WS-only. The watcher WebSocket sends up to `backfillLimit`
// recent entries on connect (replay frames) followed by `history_complete`,
// then live events. The legacy HTTP `/logs` endpoint returns 410 — see
// apps/api/src/durableObjects/lib/device.ts `getLogs` for the full incident
// write-up.
const {
  streamedLogs,
  deviceStatus,
  historyLoaded,
  connect,
  disconnect,
  clearLogs: clearStreamLogs,
} = useDeviceStream(props.projectId, props.deviceId, { backfillLimit: 100 });

const filteredLogs = computed(() => {
  if (!levelFilter.value) return streamedLogs.value;
  return streamedLogs.value.filter((log) => log.level === levelFilter.value);
});

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
  return new Date(ts).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
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
  clearStreamLogs();
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
