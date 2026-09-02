import type { CustomMetricChart } from '@/lib/config-file-types'
import type { MetricSample, MetricSeries } from './app-card-metric-chart-data'

export const tickerConfig = {
  cpu: { color: 'var(--primary)' },
  memory: { color: 'var(--primary)' },
  received: { color: 'var(--info)' },
  sent: { color: 'var(--success)' }
}

export type MetricDetail = {
  label: string
  history: MetricSample[]
  historyPeriodMs: number
  series: MetricSeries[]
  formatValue: (value: number) => string
  formatTooltipValue?: (value: number) => string
  formatAxisValue?: (value: number) => string
  chart?: Exclude<CustomMetricChart, 'none'>
  customMetricKeys?: string[]
}
