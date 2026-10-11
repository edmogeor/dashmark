import type { AppConfig } from './config'
import { canViewMetric } from './docker'
import { getDiscoveryCoordinator } from './discovery-coordinator'
import { getLatestMetricUsage } from './metrics'
import { getMetricHistory, getResourceMetricHistory, getUptimeBucketHistory } from './metrics-storage'
import type { CollectedUptimeMetric } from './metric-collection/types'
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

const uptimeBucketCache = new WeakMap<CollectedUptimeMetric, { window: number; cardId: string; databasePath: string; buckets: Record<UptimeRange, UptimeBucket[]> }>()

function visibleResource<T extends ContainerResources>(resource: T, visible: Record<'cpu' | 'memory' | 'network', boolean>): T {
  if (visible.cpu && visible.memory && visible.network) return resource
  return {
    ...resource,
    cpuPercent: visible.cpu ? resource.cpuPercent : undefined,
    memoryUsage: visible.memory ? resource.memoryUsage : undefined,
    memoryLimit: visible.memory ? resource.memoryLimit : undefined,
    receivedBytesPerSecond: visible.network ? resource.receivedBytesPerSecond : undefined,
    sentBytesPerSecond: visible.network ? resource.sentBytesPerSecond : undefined,
    networkRatePending: visible.network ? resource.networkRatePending : undefined
  }
}

export function uptimeBucketsByRange(config: AppConfig, cardId: string, metric: CollectedUptimeMetric): Record<UptimeRange, UptimeBucket[]> {
  const now = Date.now()
  // All uptime ranges roll on whole-hour boundaries. A new collection supplies a new metric object.
  const window = Math.floor(now / 3_600_000)
  const cached = uptimeBucketCache.get(metric)
  if (cached?.window === window && cached.cardId === cardId && cached.databasePath === config.metricsDatabasePath) return cached.buckets
  const buckets: Record<UptimeRange, UptimeBucket[]> = { '24h': [], '7d': [], '30d': [] }
  for (const { range, durationMs, bucketCount } of UPTIME_RANGES)
    buckets[range] = metric.observations
      ? aggregateUptimeBuckets(metric.observations, durationMs, bucketCount, { includeCurrentBucket: true, now })
      : getUptimeBucketHistory(config, cardId, metric.key, durationMs, bucketCount, now)
  uptimeBucketCache.set(metric, { window, cardId, databasePath: config.metricsDatabasePath, buckets })
  return buckets
}

function cachedMetricsSnapshot(config: AppConfig, cardId: string, historyPeriodMs: number, snapshots: MetricsSnapshots, since: number | undefined, now: number): CachedMetricsSnapshot {
  const cached = since === undefined ? snapshots.get(cardId)?.get(historyPeriodMs) : undefined
  if (cached) return cached
  const usage = getLatestMetricUsage(cardId)
  const snapshot: CachedMetricsSnapshot = {
    resource: usage?.resource ?? null,
    history: getResourceMetricHistory(config, cardId, historyPeriodMs, now, since),
    historyPeriodMs,
    pending: usage === undefined,
    customMetrics:
      usage?.customMetrics.map((metric) => ('unit' in metric ? { ...metric, history: getMetricHistory(config, cardId, metric.key, historyPeriodMs, now, since), historyPeriodMs } : metric)) ?? [],
    uptimeMetrics: (usage?.uptimeMetrics ?? []).map((metric) => ({ key: metric.key, label: metric.label, current: metric.current, buckets: uptimeBucketsByRange(config, cardId, metric) })),
    ...(usage?.metricErrors ? { metricErrors: usage.metricErrors } : {})
  }
  if (since !== undefined) return snapshot
  const cardSnapshots = snapshots.get(cardId) ?? new Map<number, CachedMetricsSnapshot>()
  cardSnapshots.set(historyPeriodMs, snapshot)
  snapshots.set(cardId, cardSnapshots)
  return snapshot
}

export function metricsSnapshot(
  config: AppConfig,
  headers: Headers,
  cardId: string,
  snapshots: MetricsSnapshots,
  includeUptime = true,
  since?: number,
  now = Date.now()
): RealtimeMetricsResponse | undefined {
  const access = getDiscoveryCoordinator(config).getMetricAccess(headers, cardId)
  if (!access) return undefined
  const visible = (metric: string) => canViewMetric(config, headers, access.metricsAccess, metric)
  const resourcesVisible = { cpu: visible('cpu'), memory: visible('memory'), network: visible('network') }
  const historyPeriodMs = access.historyPeriodMs ?? config.metricsHistoryPeriodMs
  const snapshot = cachedMetricsSnapshot(config, cardId, historyPeriodMs, snapshots, since, now)
  const customMetrics: CustomMetric[] = snapshot.customMetrics.filter((metric) => visible(metric.key))
  return {
    resource: snapshot.resource ? visibleResource(snapshot.resource, resourcesVisible) : null,
    history:
      resourcesVisible.cpu && resourcesVisible.memory && resourcesVisible.network
        ? snapshot.history
        : snapshot.history.map((sample) => visibleResource<ResourceMetricSample>(sample, resourcesVisible)),
    historyPeriodMs,
    pending: snapshot.pending,
    customMetrics,
    ...(includeUptime ? { uptimeMetrics: snapshot.uptimeMetrics?.filter((metric) => visible(metric.key)) } : {}),
    metricErrors: (snapshot.metricErrors ?? access.metricErrors ?? []).filter((error) => visible(error.key))
  }
}
