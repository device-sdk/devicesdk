---
"@devicesdk/dashboard": minor
---

Add usage-metrics charts to the dashboard, backed by the metrics API:

- **Device page → Metrics tab:** message-in/out totals, connected time, and estimated cost for the device, plus a received-vs-sent line chart with a 1h / 12h / 7d window toggle.
- **Project page → Analytics tab:** project-wide message and estimated-cost totals, a one-line-per-device "messages per device" chart (so the heaviest consumers stand out), a 30-day estimated-spend bar chart, and a top-consumers table.

Adds `echarts` + `vue-echarts` (tree-shaken registration in `lib/echarts.ts`), a pure `lib/metricsFormat.ts` (count/bytes/USD/duration formatters and chart-option builders), and a `metricsService`. All figures are sampled estimates and the UI labels them as such.
