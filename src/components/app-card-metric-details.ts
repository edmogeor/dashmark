import { chartColorVariable } from '@/lib/badge-color'
import type { Locale } from '@/i18n'
import type { ContainerResources, CustomMetric, NumericCustomMetric, ResourceMetricSample } from '@/lib/status'
import { customMetricsHistory, resourceMetricHistory } from './app-card-metric-chart-data'
import { formatAxisBytes, formatAxisCustomMetric, formatAxisPercent, formatDetailedBytes, formatDetailedCustomMetric, formatDetailedPercent } from './app-card-metric-formatters'
import { tickerConfig, type MetricDetail } from './app-card-metrics'

export function resourceMetricDetail(label: string, history: ResourceMetricSample[], historyPeriodMs: number, key: 'cpu' | 'memory', resources: ContainerResources, locale: Locale): MetricDetail {
  const memory = key === 'memory'
  const limit = resources.memoryLimit
  return {
    label,
    history: resourceMetricHistory(history),
    historyPeriodMs,
    series: [
      {
        key,
        label,
        color: tickerConfig[key].color,
        value: (sample) => (memory && limit && sample.memory !== undefined ? (sample.memory / limit) * 100 : sample[key])
      }
    ],
    formatValue: (value) => (memory && limit ? formatDetailedPercent(value, locale) : memory ? formatDetailedBytes(value, locale) : formatDetailedPercent(value, locale)),
    formatTooltipValue: memory && limit ? (value) => `${formatDetailedBytes((value / 100) * limit, locale)} (${formatDetailedPercent(value, locale)})` : undefined,
    formatAxisValue: memory && limit ? (value) => formatAxisPercent(value, locale) : memory ? (value) => formatAxisBytes(value, locale) : (value) => formatAxisPercent(value, locale),
    chart: 'line'
  }
}

export function networkMetricDetail(history: ResourceMetricSample[], historyPeriodMs: number, label: string, receivedLabel: string, sentLabel: string, locale: Locale): MetricDetail {
  return {
    label,
    history: resourceMetricHistory(history),
    historyPeriodMs,
    series: [
      { key: 'received', label: receivedLabel, color: tickerConfig.received.color, value: (sample) => sample.received },
      { key: 'sent', label: sentLabel, color: tickerConfig.sent.color, value: (sample) => sample.sent }
    ],
    formatValue: (value) => `${formatDetailedBytes(value, locale)}/s`,
    formatAxisValue: (value) => `${formatAxisBytes(value, locale)}/s`,
    chart: 'step'
  }
}

export function customMetricDetail(metric: NumericCustomMetric, customMetrics: CustomMetric[], locale: Locale): MetricDetail {
  const chartMetrics =
    metric.chartGroup === undefined ? [metric] : customMetrics.filter((candidate): candidate is NumericCustomMetric => 'unit' in candidate && candidate.chartGroup === metric.chartGroup)
  return {
    label: metric.label,
    history: customMetricsHistory(chartMetrics),
    historyPeriodMs: metric.historyPeriodMs,
    series: chartMetrics.map((candidate, index) => ({
      key: candidate.key,
      label: candidate.label,
      color: chartColorVariable(index),
      value: (sample) => sample[candidate.key]
    })),
    formatValue: (value) => formatDetailedCustomMetric(value, metric.unit, locale),
    formatAxisValue: (value) => formatAxisCustomMetric(value, metric.unit, locale),
    chart: metric.chart === 'none' ? 'step' : metric.chart,
    customMetricKeys: chartMetrics.map((candidate) => candidate.key)
  }
}
