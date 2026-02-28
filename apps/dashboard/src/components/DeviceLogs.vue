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
      <q-toggle v-model="autoRefresh" label="Auto-refresh" />
      <q-btn flat icon="refresh" :loading="loading" @click="fetchLogs()">
        <q-tooltip>Refresh</q-tooltip>
      </q-btn>
    </div>

    <div v-if="loading && logs.length === 0" class="text-center q-pa-xl">
      <q-spinner-dots color="primary" size="40px" />
    </div>

    <div v-else-if="logs.length === 0" class="text-center q-pa-xl">
      <q-icon name="article" size="64px" color="grey-4" class="q-mb-md" />
      <div class="text-h6 text-grey-6 q-mb-sm">No logs yet</div>
      <p class="text-body2 text-grey-5">
        Logs from console.log, console.warn, etc. in your device script will appear here.
      </p>
    </div>

    <div v-else class="logs-container">
      <div
        v-for="log in logs"
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

      <div v-if="nextCursor" class="text-center q-pa-md">
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
import { ref, onMounted, onUnmounted, watch } from 'vue';
import { logService, type DeviceLog } from '@/services/api.service';

const props = defineProps<{
  projectId: string;
  deviceId: string;
}>();

const logs = ref<DeviceLog[]>([]);
const nextCursor = ref<string | null>(null);
const loading = ref(false);
const loadingMore = ref(false);
const autoRefresh = ref(false);
const levelFilter = ref<string | null>(null);
let refreshInterval: ReturnType<typeof setInterval> | null = null;

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

watch(levelFilter, () => {
  void fetchLogs();
});

watch(autoRefresh, (enabled) => {
  if (enabled) {
    refreshInterval = setInterval(() => void fetchLogs(), 5000);
  } else if (refreshInterval) {
    clearInterval(refreshInterval);
    refreshInterval = null;
  }
});

onMounted(() => {
  void fetchLogs();
});

onUnmounted(() => {
  if (refreshInterval) {
    clearInterval(refreshInterval);
  }
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
