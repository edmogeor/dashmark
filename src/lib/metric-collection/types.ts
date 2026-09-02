import type { MetricOverride } from '../config-file-types'
import type { ResourceStat } from '../labels'
import type { ContainerResources, UptimeMetric } from '../status'

export type CollectedCustomMetric =
  | {
      key: string
      label: string
      unit: Extract<MetricOverride, { valueType: 'number' }>['unit']
      chart: Extract<MetricOverride, { valueType: 'number' }>['chart']
      chartGroup?: string
      rate?: true
      value: number
      pending?: true
    }
  | { key: string; label: string; value: string }
  | {
      key: string
      label: string
      color: Extract<MetricOverride, { valueType: 'state' }>['color']
      valueLabel?: string
      value: string
    }

export type CollectedUptimeMetric = UptimeMetric

export type ContainerMetricUsage = {
  resource?: ContainerResources
  historyPeriodMs: number
  customMetrics: CollectedCustomMetric[]
  uptimeMetrics?: CollectedUptimeMetric[]
  metricErrors: { key: string; code: 'collection_failed' | 'configuration_invalid' }[]
  metricsAccess?: Record<string, string[]>
  metricsPollIntervalMs?: number
}

export type ContainerMetricSample = {
  cardId: string
  resource: ContainerResources | undefined
  customMetrics: CollectedCustomMetric[]
  uptimeMetrics?: CollectedUptimeMetric[]
  metricErrors: ContainerMetricUsage['metricErrors']
  metricsPollIntervalMs: number
  metricsHistoryPeriodMs: number
}

export type MetricCollectionDetails = {
  resourceStats: readonly ResourceStat[]
  selectedMetrics: [key: string, metric: MetricOverride][]
  metricErrors: ContainerMetricUsage['metricErrors']
  historyPeriodMs: number
  metricsAccess?: Record<string, string[]>
  metricsPollIntervalMs: number
}
