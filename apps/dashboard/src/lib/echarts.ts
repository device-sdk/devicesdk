// Tree-shaken ECharts registration. Importing this module once (it runs for its
// side effects) registers only the renderer, chart types, and components the
// metrics panels actually use, keeping the SPA bundle lean. Any component that
// renders a chart should `import '@/lib/echarts'` alongside the vue-echarts
// `VChart` component.

import { BarChart, LineChart } from 'echarts/charts';
import {
  DataZoomComponent,
  GridComponent,
  LegendComponent,
  TooltipComponent,
} from 'echarts/components';
import { use } from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';

use([
  CanvasRenderer,
  LineChart,
  BarChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  DataZoomComponent,
]);
