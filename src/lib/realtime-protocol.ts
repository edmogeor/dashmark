import { isRecord } from './errors'
import type { MetricsResponse, UptimeMetric } from './status'
import type { UptimeBucket } from './uptime-buckets'
import type { UptimeRange } from './uptime-ranges'

export type RealtimeMetricsResponse = Omit<MetricsResponse, 'uptimeMetrics'> & {
  uptimeMetrics?: (Omit<UptimeMetric, 'observations'> & { buckets: Record<UptimeRange, UptimeBucket[]> })[]
}

export type ClientMessage = { type: 'subscribe_status' } | { type: 'subscribe_metrics'; cardId: string } | { type: 'unsubscribe_metrics'; cardId: string }

export function parseClientMessage(value: unknown): ClientMessage | undefined {
  if (!isRecord(value)) return undefined
  if (value.type === 'subscribe_status' && Object.keys(value).length === 1) return { type: value.type }
  if (
    (value.type === 'subscribe_metrics' || value.type === 'unsubscribe_metrics') &&
    typeof value.cardId === 'string' &&
    value.cardId.length > 0 &&
    value.cardId.length <= 256 &&
    Object.keys(value).length === 2
  ) {
    return { type: value.type, cardId: value.cardId }
  }
  return undefined
}
