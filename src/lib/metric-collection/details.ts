import type { AppConfig } from '../config'
import type { MetricOverride } from '../config-file-types'
import type { ResolvedMetricCard } from '../docker-card-resolution'
import { RESOURCE_STATS } from '../labels'
import { localizeMetricLabel } from '../metric-translations'
import type { MetricCollectionDetails } from './types'

function selectedMetricLabels(resolved: ResolvedMetricCard): [key: string, metric: MetricOverride][] {
  if (!resolved.labels.metrics) return []
  return resolved.labels.metrics.flatMap((key) => {
    const metric = resolved.metricDefinitions[key]
    return metric ? [[key, metric]] : []
  })
}

function selectedCustomMetrics(resolved: ResolvedMetricCard): [key: string, metric: MetricOverride][] {
  if (!resolved.customMetrics) return []
  return selectedMetricLabels(resolved).flatMap(([key]) => {
    const metric = resolved.customMetrics?.[key]
    return metric ? [[key, metric]] : []
  })
}

function selectedCustomMetricErrors(resolved: ResolvedMetricCard): { key: string; code: 'configuration_invalid' }[] {
  if (!resolved.labels.metrics) return []
  return resolved.labels.metrics.flatMap((key) => (resolved.customMetricErrors?.[key] ? [{ key, code: 'configuration_invalid' }] : []))
}

export function metricCollectionDetails(resolved: ResolvedMetricCard, config: AppConfig, hasContainer = true): MetricCollectionDetails {
  return {
    resourceStats: hasContainer ? (resolved.labels.resourceStats ?? RESOURCE_STATS) : [],
    selectedMetrics: selectedCustomMetrics(resolved),
    metricErrors: selectedCustomMetricErrors(resolved),
    historyPeriodMs: resolved.labels.metricsHistoryPeriodMs ?? config.metricsHistoryPeriodMs,
    metricsAccess: resolved.labels.metricsAccess,
    metricsPollIntervalMs: resolved.labels.metricsPollIntervalMs ?? config.metricsPollIntervalMs
  }
}

export function metricCardFields(resolved: ResolvedMetricCard, config: AppConfig) {
  const customMetricLabels = selectedMetricLabels(resolved).map(([key, metric]) => ({ key, label: localizeMetricLabel(config.locale, key, metric.label) }))
  const selectedMetrics = selectedCustomMetrics(resolved)
  const customMetricKeys = selectedMetrics.flatMap(([key, metric]) => (metric.valueType === 'number' ? [key] : []))
  const uptimeMetricKeys = selectedMetrics.flatMap(([key, metric]) => (metric.valueType === 'uptime' ? [key] : []))
  const metricErrors = selectedCustomMetricErrors(resolved)
  return {
    ...(customMetricLabels.length > 0 ? { customMetricLabels } : {}),
    ...(customMetricKeys.length > 0 ? { customMetricKeys } : {}),
    ...(uptimeMetricKeys.length > 0 ? { uptimeMetricKeys } : {}),
    metricsPollIntervalMs: resolved.labels.metricsPollIntervalMs ?? config.metricsPollIntervalMs,
    metricsHistoryPeriodMs: resolved.labels.metricsHistoryPeriodMs,
    metricsAccess: resolved.labels.metricsAccess,
    ...(metricErrors.length > 0 ? { metricErrors } : {})
  }
}
