import { isRecord } from './errors'
import type { MetricsResponse, UptimeMetric } from './status'
import type { UptimeBucket } from './uptime-buckets'
import type { UptimeRange } from './uptime-ranges'

export type RealtimeMetricsResponse = Omit<MetricsResponse, 'uptimeMetrics'> & {
  uptimeMetrics?: (Omit<UptimeMetric, 'observations'> & { buckets: Record<UptimeRange, UptimeBucket[]> })[]
}

export type ClientMessage =
  | { type: 'subscribe_status' }
  | { type: 'subscribe_metrics'; cardId: string; incremental?: boolean }
  | { type: 'unsubscribe_metrics'; cardId: string }
  | { type: 'set_metric_priority'; cardId: string; priority: boolean; metricKey?: string }

export function parseClientMessage(value: unknown): ClientMessage | undefined {
  if (!isRecord(value)) return undefined
  if (value.type === 'subscribe_status' && Object.keys(value).length === 1) return { type: value.type }
  if (value.type === 'set_metric_priority') {
    if (
      Object.keys(value).some((key) => !['type', 'cardId', 'priority', 'metricKey'].includes(key)) ||
      typeof value.cardId !== 'string' ||
      !value.cardId ||
      value.cardId.length > 256 ||
      typeof value.priority !== 'boolean' ||
      (value.metricKey !== undefined && (typeof value.metricKey !== 'string' || !value.metricKey || value.metricKey.length > 256))
    )
      return undefined
    return { type: value.type, cardId: value.cardId, priority: value.priority, ...(typeof value.metricKey === 'string' ? { metricKey: value.metricKey } : {}) }
  }
  if (
    (value.type === 'subscribe_metrics' || value.type === 'unsubscribe_metrics') &&
    typeof value.cardId === 'string' &&
    value.cardId.length > 0 &&
    value.cardId.length <= 256 &&
    (Object.keys(value).length === 2 || (value.type === 'subscribe_metrics' && Object.keys(value).length === 3 && typeof value.incremental === 'boolean'))
  ) {
    return value.type === 'subscribe_metrics' && typeof value.incremental === 'boolean'
      ? { type: value.type, cardId: value.cardId, incremental: value.incremental }
      : { type: value.type, cardId: value.cardId }
  }
  return undefined
}
