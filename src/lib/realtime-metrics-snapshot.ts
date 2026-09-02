import type { AppConfig } from './config'
import { canViewMetric } from './docker'
import { getDiscoveryCoordinator } from './discovery-coordinator'
import { getLatestMetricUsage } from './metrics'
import { getMetricHistory, getResourceMetricHistory } from './metrics-storage'
import type { RealtimeMetricsResponse } from './realtime-protocol'
import type { ContainerResources, CustomMetric, MetricsResponse, ResourceMetricSample, UptimeMetric } from './status'
import { aggregateUptimeBuckets, type UptimeBucket } from './uptime-buckets'
import { UPTIME_RANGES, type UptimeRange } from './uptime-ranges'

type RealtimeUptimeMetric = Omit<UptimeMetric, 'observations'> & { buckets: Record<UptimeRange, UptimeBucket[]> }
type CachedMetricsSnapshot = {
  resource: ContainerResources | null
  history: ResourceMetricSample[]
  historyPeriodMs: number
  pending: boolean
  customMetrics: CustomMetric[]
  uptimeMetrics: RealtimeUptimeMetric[]
  metricErrors?: MetricsResponse['metricErrors']
}

export type MetricsSnapshots = Map<string, Map<number, CachedMetricsSnapshot>>

function visibleResource<T extends ContainerResources>(resource: T, visible: (metric: string) => boolean): T {
  return {
    ...resource,
    cpuPercent: visible('cpu') ? resource.cpuPercent : undefined,
    memoryUsage: visible('memory') ? resource.memoryUsage : undefined,
    memoryLimit: visible('memory') ? resource.memoryLimit : undefined,
    receivedBytesPerSecond: visible('network') ? resource.receivedBytesPerSecond : undefined,
    sentBytesPerSecond: visible('network') ? resource.sentBytesPerSecond : undefined,
    networkRatePending: visible('network') ? resource.networkRatePending : undefined
  }
}

export function uptimeBucketsByRange(metric: UptimeMetric): Record<UptimeRange, UptimeBucket[]> {
  const buckets: Record<UptimeRange, UptimeBucket[]> = { '24h': [], '7d': [], '30d': [] }
  for (const { range, durationMs, bucketCount } of UPTIME_RANGES) buckets[range] = aggregateUptimeBuckets(metric.observations, durationMs, bucketCount, { includeCurrentBucket: true })
  return buckets
}

function cachedMetricsSnapshot(config: AppConfig, cardId: string, historyPeriodMs: number, snapshots: MetricsSnapshots): CachedMetricsSnapshot {
  const cached = snapshots.get(cardId)?.get(historyPeriodMs)
  if (cached) return cached
  const usage = getLatestMetricUsage(cardId)
  const snapshot: CachedMetricsSnapshot = {
    resource: usage?.resource ?? null,
    history: getResourceMetricHistory(config, cardId, historyPeriodMs),
    historyPeriodMs,
    pending: usage === undefined,
    customMetrics: usage?.customMetrics.map((metric) => ('unit' in metric ? { ...metric, history: getMetricHistory(config, cardId, metric.key, historyPeriodMs), historyPeriodMs } : metric)) ?? [],
    uptimeMetrics: (usage?.uptimeMetrics ?? []).map((metric) => ({ key: metric.key, label: metric.label, current: metric.current, buckets: uptimeBucketsByRange(metric) })),
    ...(usage?.metricErrors ? { metricErrors: usage.metricErrors } : {})
  }
  const cardSnapshots = snapshots.get(cardId) ?? new Map<number, CachedMetricsSnapshot>()
  cardSnapshots.set(historyPeriodMs, snapshot)
  snapshots.set(cardId, cardSnapshots)
  return snapshot
}

export function metricsSnapshot(config: AppConfig, headers: Headers, cardId: string, snapshots: MetricsSnapshots, includeUptime = true): RealtimeMetricsResponse | undefined {
  const access = getDiscoveryCoordinator(config).getMetricAccess(headers, cardId)
  if (!access) return undefined
  const visible = (metric: string) => canViewMetric(config, headers, access.metricsAccess, metric)
  const historyPeriodMs = access.historyPeriodMs ?? config.metricsHistoryPeriodMs
  const snapshot = cachedMetricsSnapshot(config, cardId, historyPeriodMs, snapshots)
  const customMetrics: CustomMetric[] = snapshot.customMetrics.filter((metric) => visible(metric.key))
  return {
    resource: snapshot.resource ? visibleResource(snapshot.resource, visible) : null,
    history: snapshot.history.map((sample) => visibleResource<ResourceMetricSample>(sample, visible)),
    historyPeriodMs,
    pending: snapshot.pending,
    customMetrics,
    ...(includeUptime ? { uptimeMetrics: snapshot.uptimeMetrics?.filter((metric) => visible(metric.key)) } : {}),
    metricErrors: (snapshot.metricErrors ?? access.metricErrors ?? []).filter((error) => visible(error.key))
  }
}
