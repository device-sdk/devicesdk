<template>
  <div
    class="metrics-chart"
    :style="{ height: `${height}px` }"
    role="img"
    :aria-label="ariaLabel || emptyLabel"
  >
    <div v-if="loading" class="metrics-chart__overlay">
      <q-spinner-dots color="primary" size="40px" />
    </div>
    <div v-else-if="error" class="metrics-chart__overlay text-negative">
      <q-icon name="error_outline" size="40px" class="q-mb-sm" />
      <div>Couldn't load usage data</div>
    </div>
    <div v-else-if="empty" class="metrics-chart__overlay text-grey-6">
      <q-icon name="show_chart" size="40px" class="q-mb-sm" />
      <div>{{ emptyLabel }}</div>
    </div>
    <v-chart v-else :option="option" autoresize />
  </div>
</template>

<script setup lang="ts">
import type { EChartsOption } from 'echarts';
import VChart from 'vue-echarts';
// Side-effect import: registers the renderer/charts/components VChart needs.
import '@/lib/echarts';

withDefaults(
  defineProps<{
    option: EChartsOption;
    loading?: boolean;
    empty?: boolean;
    error?: boolean;
    emptyLabel?: string;
    /** Text alternative for screen readers (the canvas itself is invisible to AT). */
    ariaLabel?: string;
    height?: number;
  }>(),
  {
    loading: false,
    empty: false,
    error: false,
    emptyLabel: 'No usage data for this period yet',
    ariaLabel: '',
    height: 280,
  },
);
</script>

<style scoped lang="scss">
.metrics-chart {
  position: relative;
  width: 100%;

  &__overlay {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
  }
}
</style>
