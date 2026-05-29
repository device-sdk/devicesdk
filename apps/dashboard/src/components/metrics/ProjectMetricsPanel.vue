<template>
  <div class="project-metrics">
    <div class="row items-center justify-between q-mb-md">
      <div class="text-subtitle1 text-weight-bold">Usage across devices</div>
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
      <div class="col-6 col-md-4">
        <div class="stat-card">
          <q-icon name="swap_vert" size="28px" color="primary" />
          <div class="stat-value">{{ formatCount(totalMessages) }}</div>
          <div class="stat-label">Messages ({{ window }})</div>
        </div>
      </div>
      <div class="col-6 col-md-4">
        <div class="stat-card">
          <q-icon name="payments" size="28px" color="secondary" />
          <div class="stat-value">{{ formatUsd(totals.estimated_cost_usd) }}</div>
          <div class="stat-label">Est. cost ({{ window }})</div>
        </div>
      </div>
      <div class="col-12 col-md-4">
        <div class="stat-card">
          <q-icon name="calendar_month" size="28px" color="positive" />
          <div class="stat-value">{{ formatUsd(billingTotal) }}</div>
          <div class="stat-label">Est. spend (last 30d)</div>
        </div>
      </div>
    </div>

    <div class="text-subtitle2 text-weight-bold q-mb-sm">
      Messages per device
    </div>
    <MetricsChart
      :option="messagesOption"
      :loading="loading"
      :empty="!loading && noDeviceUsage"
      empty-label="No device usage for this period yet"
    />

    <q-separator class="q-my-lg" />

    <div class="text-subtitle2 text-weight-bold q-mb-sm">
      Estimated spend — last 30 days
    </div>
    <MetricsChart
      :option="billingOption"
      :loading="loading"
      :empty="!loading && billingDaily.length === 0"
      empty-label="No billable usage in the last 30 days"
      :height="220"
    />

    <div v-if="rankedDevices.length" class="q-mt-lg">
      <div class="text-subtitle2 text-weight-bold q-mb-sm">
        Top consumers ({{ window }})
      </div>
      <q-table
        flat
        dense
        :rows="rankedDevices"
        :columns="columns"
        row-key="device_id"
        hide-pagination
        :pagination="{ rowsPerPage: 0 }"
      />
    </div>

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
  buildBillingOption,
  buildProjectMessagesOption,
  formatCount,
  formatUsd,
} from '@/lib/metricsFormat';
import {
  metricsService,
  type MetricsWindow,
  type ProjectDeviceMetrics,
  type ProjectMetrics,
  type UsageTotals,
} from '@/services/api.service';

const props = defineProps<{ projectId: string }>();

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

const columns = [
  { name: 'name', label: 'Device', field: 'name', align: 'left' as const },
  {
    name: 'messages',
    label: 'Messages',
    align: 'right' as const,
    field: (r: ProjectDeviceMetrics) =>
      r.totals.messages_in + r.totals.messages_out,
    format: (v: number) => formatCount(v),
    sortable: true,
  },
  {
    name: 'cost',
    label: 'Est. cost',
    align: 'right' as const,
    field: (r: ProjectDeviceMetrics) => r.totals.estimated_cost_usd,
    format: (v: number) => formatUsd(v),
    sortable: true,
  },
];

const window = ref<MetricsWindow>('12h');
const loading = ref(true);
const devices = ref<ProjectDeviceMetrics[]>([]);
const totals = ref<UsageTotals>({ ...EMPTY_TOTALS });
const billingDaily = ref<ProjectMetrics['billing']['daily']>([]);
const billingTotal = ref(0);

const totalMessages = computed(
  () => totals.value.messages_in + totals.value.messages_out,
);
const noDeviceUsage = computed(() =>
  devices.value.every((d) => d.series.length === 0),
);
const messagesOption = computed(() => buildProjectMessagesOption(devices.value));
const billingOption = computed(() => buildBillingOption(billingDaily.value));

// Highest-usage devices first, dropping those with no usage in the window.
const rankedDevices = computed(() =>
  [...devices.value]
    .filter((d) => d.totals.messages_in + d.totals.messages_out > 0)
    .sort(
      (a, b) =>
        b.totals.messages_in +
        b.totals.messages_out -
        (a.totals.messages_in + a.totals.messages_out),
    )
    .map((d) => ({ ...d, name: d.name || d.device_id })),
);

const fetchMetrics = async () => {
  try {
    loading.value = true;
    const data = await metricsService.getProject(props.projectId, window.value);
    devices.value = data.devices;
    totals.value = data.totals;
    billingDaily.value = data.billing.daily;
    billingTotal.value = data.billing.total_usd;
  } catch (error) {
    console.error('Error fetching project metrics:', error);
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
