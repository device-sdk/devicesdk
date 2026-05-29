<template>
  <div class="device-metrics">
    <div class="row items-center justify-between q-mb-md">
      <div class="text-subtitle1 text-weight-bold">Usage</div>
      <q-btn-toggle
        v-model="window"
        :options="windowOptions"
        unelevated
        no-caps
        toggle-color="primary"
        color="grey-3"
        text-color="grey-8"
        size="sm"
        @update:model-value="fetchMetrics"
      />
    </div>

    <div class="row q-col-gutter-md q-mb-lg">
      <div class="col-6 col-md-3">
        <div class="stat-card">
          <q-icon name="south" size="28px" color="primary" />
          <div class="stat-value">{{ formatCount(totals.messages_in) }}</div>
          <div class="stat-label">Messages received</div>
        </div>
      </div>
      <div class="col-6 col-md-3">
        <div class="stat-card">
          <q-icon name="north" size="28px" color="secondary" />
          <div class="stat-value">{{ formatCount(totals.messages_out) }}</div>
          <div class="stat-label">Messages sent</div>
        </div>
      </div>
      <div class="col-6 col-md-3">
        <div class="stat-card">
          <q-icon name="schedule" size="28px" color="grey-7" />
          <div class="stat-value">{{ formatDuration(totals.connected_seconds) }}</div>
          <div class="stat-label">Connected</div>
        </div>
      </div>
      <div class="col-6 col-md-3">
        <div class="stat-card">
          <q-icon name="payments" size="28px" color="positive" />
          <div class="stat-value">{{ formatUsd(totals.estimated_cost_usd) }}</div>
          <div class="stat-label">Est. cost</div>
        </div>
      </div>
    </div>

    <MetricsChart
      :option="messagesOption"
      :loading="loading"
      :empty="!loading && isEmpty"
    />

    <p class="text-caption text-grey-6 q-mt-md">
      Estimated from sampled metrics — not an exact bill.
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useQuasar } from 'quasar';
import MetricsChart from '@/components/metrics/MetricsChart.vue';
import {
  buildDeviceMessagesOption,
  formatCount,
  formatDuration,
  formatUsd,
} from '@/lib/metricsFormat';
import {
  metricsService,
  type MetricsWindow,
  type UsageBucket,
  type UsageTotals,
} from '@/services/api.service';

const props = defineProps<{ projectId: string; deviceId: string }>();

const $q = useQuasar();

const windowOptions = [
  { label: '1h', value: '1h' },
  { label: '12h', value: '12h' },
  { label: '7d', value: '7d' },
];

const EMPTY_TOTALS: UsageTotals = {
  messages_in: 0,
  messages_out: 0,
  bytes_in: 0,
  bytes_out: 0,
  cron_fires: 0,
  connected_seconds: 0,
  estimated_cost_usd: 0,
};

const window = ref<MetricsWindow>('1h');
const loading = ref(true);
const series = ref<UsageBucket[]>([]);
const totals = ref<UsageTotals>({ ...EMPTY_TOTALS });

const isEmpty = computed(() => series.value.length === 0);
const messagesOption = computed(() => buildDeviceMessagesOption(series.value));

const fetchMetrics = async () => {
  try {
    loading.value = true;
    const data = await metricsService.getDevice(
      props.projectId,
      props.deviceId,
      window.value,
    );
    series.value = data.series;
    totals.value = data.totals;
  } catch (error) {
    console.error('Error fetching device metrics:', error);
    $q.notify({
      type: 'negative',
      message: 'Failed to load metrics',
      position: 'top',
    });
  } finally {
    loading.value = false;
  }
};

onMounted(fetchMetrics);
</script>
