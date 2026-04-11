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
      <q-toggle v-model="liveStream" label="Live" />
      <q-btn v-if="liveStream" flat icon="delete_sweep" @click="clearLogs">
        <q-tooltip>Clear live logs</q-tooltip>
      </q-btn>
      <q-btn flat icon="refresh" :loading="loading" @click="fetchLogs()">
        <q-tooltip>Refresh</q-tooltip>
      </q-btn>
    </div>

    <div v-if="loading && displayLogs.length === 0" class="text-center q-pa-xl">
      <q-spinner-dots color="primary" size="40px" />
    </div>

    <div v-else-if="displayLogs.length === 0" class="text-center q-pa-xl">
      <q-icon name="article" size="64px" color="grey-4" class="q-mb-md" />
      <div class="text-h6 text-grey-6 q-mb-sm">No logs yet</div>
      <p class="text-body2 text-grey-5">
        Logs from console.log, console.warn, etc. in your device script will appear here.
        <span v-if="!liveStream">Enable <b>Live</b> to stream logs in real time.</span>
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

      <div v-if="!liveStream && nextCursor" class="text-center q-pa-md">
        <q-btn
          outline
          color="primary"
          label="Load More"
          :loading="loadingMore"
          @click="loadMore"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { logService, type DeviceLog } from '@/services/api.service';
import { useDeviceStream } from '@/composables/useDeviceStream';

const props = defineProps<{
  projectId: string;
  deviceId: string;
}>();

// REST-based log fetching (history)
const logs = ref<DeviceLog[]>([]);
const nextCursor = ref<string | null>(null);
const loading = ref(false);
const loadingMore = ref(false);
const levelFilter = ref<string | null>(null);

// Live streaming
const liveStream = ref(false);
const { streamedLogs, deviceStatus, connect, disconnect, clearLogs: clearStreamLogs } = useDeviceStream(props.projectId, props.deviceId);

// Display either streamed logs (live mode) or REST logs (history mode)
const displayLogs = computed(() => liveStream.value ? streamedLogs.value : logs.value);

const filteredLogs = computed(() => {
  const source = displayLogs.value;
  if (!levelFilter.value) return source;
  return source.filter((log) => log.level === levelFilter.value);
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

const fetchLogs = async () => {
  loading.value = true;
  logs.value = [];
  nextCursor.value = null;
  try {
    const result = await logService.getLogs(props.projectId, props.deviceId, {
      limit: 50,
      level: levelFilter.value ?? undefined,
    });
    logs.value = result.logs;
    nextCursor.value = result.next_cursor;
  } catch (err) {
    console.error('Failed to fetch logs:', err);
  } finally {
    loading.value = false;
  }
};

const loadMore = async () => {
  if (!nextCursor.value) return;
  loadingMore.value = true;
  try {
    const result = await logService.getLogs(props.projectId, props.deviceId, {
      cursor: nextCursor.value,
      limit: 50,
      level: levelFilter.value ?? undefined,
    });
    logs.value = [...logs.value, ...result.logs];
    nextCursor.value = result.next_cursor;
  } catch (err) {
    console.error('Failed to load more logs:', err);
  } finally {
    loadingMore.value = false;
  }
};

const clearLogs = () => {
  clearStreamLogs();
};

watch(levelFilter, () => {
  if (!liveStream.value) {
    void fetchLogs();
  }
});

watch(liveStream, (enabled) => {
  if (enabled) {
    connect();
  } else {
    disconnect();
    // Refresh REST logs when switching back to history mode
    void fetchLogs();
  }
});

onMounted(() => {
  void fetchLogs();
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
