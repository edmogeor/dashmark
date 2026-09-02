import { useEffect, type Dispatch, type SetStateAction } from 'react'
import type { Card } from '@/lib/docker'
import { clearStaleErrorToasts, showErrorToast } from '@/lib/error-toasts'
import type { UptimeMetricSummary } from '@/lib/realtime-client'
import type { CustomMetric, ResourceMetricSample } from '@/lib/status'
import { customMetricsHistory, resourceMetricHistory } from './app-card-metric-chart-data'
import type { MetricDetail } from './app-card-metrics'
import { useLocalization } from './localization'

export function shouldShowResources(card: Card, showMetrics: boolean): boolean {
  const hasSelectedCustomMetric = card.metrics?.some((metric) => !['cpu', 'memory', 'network', 'none'].includes(metric)) ?? false
  const hasCustomMetrics = (card.customMetricLabels?.length ?? 0) > 0 || (card.metricErrors?.length ?? 0) > 0 || hasSelectedCustomMetric
  return showMetrics && card.showStatus !== false && ((card.hasContainer && ((card.resourceStats?.length ?? 0) > 0 || hasCustomMetrics)) || (!card.hasContainer && hasCustomMetrics))
}

export function useMetricErrorToasts(card: Card, metricErrors: { key: string; code: 'collection_failed' | 'configuration_invalid' }[]) {
  const { messages } = useLocalization()
  const allErrors = [...(card.metricErrors ?? []), ...metricErrors]
  const signature = allErrors.map((error) => `${error.key}:${error.code}`).join('|')
  useEffect(() => {
    const activeErrors = new Set(allErrors.map((error) => `metric-${card.id}:${error.key}`))
    for (const error of allErrors) {
      const label = card.customMetricLabels?.find((metric) => metric.key === error.key)?.label ?? error.key
      const detail = error.code === 'configuration_invalid' ? messages.metrics.configurationInvalid : messages.metrics.collectionFailed
      showErrorToast(`metric-${card.id}:${error.key}`, messages.card.metricUnavailable(card.title), `${label}: ${detail}`)
    }
    clearStaleErrorToasts(`metric-${card.id}:`, activeErrors)
  }, [card.id, card.title, messages, signature])
}

export function useLiveMetricDetail(setDetail: Dispatch<SetStateAction<MetricDetail | null>>, history: ResourceMetricSample[], customMetrics: CustomMetric[]) {
  useEffect(() => setDetail((current) => (!current || current.customMetricKeys ? current : { ...current, history: resourceMetricHistory(history) })), [history, setDetail])
  useEffect(
    () =>
      setDetail((current) => {
        if (!current?.customMetricKeys) return current
        const metrics = current.customMetricKeys.flatMap((key) => {
          const metric = customMetrics.find((candidate) => candidate.key === key)
          return metric && 'unit' in metric ? [metric] : []
        })
        return metrics.length === current.customMetricKeys.length ? { ...current, history: customMetricsHistory(metrics), historyPeriodMs: metrics[0]!.historyPeriodMs } : current
      }),
    [customMetrics, setDetail]
  )
}

export function isStatusBadgeVisible(card: Card, showStatus: boolean, isLoading: boolean): boolean {
  const hasStatus = card.health === 'starting' || card.health === 'unhealthy' || Boolean(card.state)
  return showStatus && card.showStatus !== false && (hasStatus || (isLoading && card.hasContainer))
}

export function isMetricUsageActive(resourceOpen: boolean, hovered: boolean, detail: MetricDetail | null, uptimeDetail: UptimeMetricSummary | null): boolean {
  return resourceOpen || hovered || detail !== null || uptimeDetail !== null
}
