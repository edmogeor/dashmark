import type { AppConfig } from '../config'
import type { ServiceOverrides } from '../config-file-types'
import { UPTIME_HISTORY_PERIOD_MS, PAGINATED_UPTIME_RECOVERY_SOURCE_PREFIX } from '../constants'
import { collectCustomMetric } from '../custom-metrics'
import { queuePaginatedUptimeRecovery } from '../paginated-uptime-recovery'
import { cancelMetricRecovery, hasMetricRecovery } from '../metric-recovery'
import type { DockerContainer, DockerStats } from '../docker-api'
import { dockerRequest, parseDockerStats } from '../docker-api'
import type { ResolvedContainer, ResolvedMetricCard } from '../docker-card-resolution'
import { isValidUrl, type ResourceStat } from '../labels'
import { getLatestUptimeObservation, getUptimeObservationHistory, hasUptimeObservationHistory, saveUptimeObservationHistory } from '../metrics-storage'
import { localizeMetricLabel } from '../metric-translations'
import type { ContainerResources } from '../status'
import { metricCollectionDetails } from './details'
import type { CollectedCustomMetric, ContainerMetricSample, ContainerMetricUsage, MetricCollectionDetails } from './types'

export type MetricCollectionTarget = {
  cardId: string
  metricsPollIntervalMs: number
  hasContainerResource: boolean
  metricSources: readonly (readonly [string, string])[]
  collect: (includeUptimeHistory?: boolean) => Promise<ContainerMetricSample | undefined>
}

const networkUsageCache = new Map<string, { receivedBytes: number; sentBytes: number; timestamp: number }>()

export function clearMetricCollectionCache(): void {
  networkUsageCache.clear()
}

export function pruneMetricCollectionCache(activeCardIds: ReadonlySet<string>): void {
  for (const cardId of networkUsageCache.keys()) if (!activeCardIds.has(cardId)) networkUsageCache.delete(cardId)
}

function networkRates(cardId: string, stats: DockerStats): Pick<ContainerResources, 'receivedBytesPerSecond' | 'sentBytesPerSecond' | 'networkRatePending'> {
  const previous = networkUsageCache.get(cardId)
  const timestamp = Date.now()
  const elapsedSeconds = previous ? (timestamp - previous.timestamp) / 1_000 : 0
  const hasNetworkCounters = stats.receivedBytes !== undefined && stats.sentBytes !== undefined
  const receivedBytesPerSecond = previous && elapsedSeconds > 0 && stats.receivedBytes !== undefined ? Math.max(0, (stats.receivedBytes - previous.receivedBytes) / elapsedSeconds) : undefined
  const sentBytesPerSecond = previous && elapsedSeconds > 0 && stats.sentBytes !== undefined ? Math.max(0, (stats.sentBytes - previous.sentBytes) / elapsedSeconds) : undefined
  if (hasNetworkCounters) networkUsageCache.set(cardId, { receivedBytes: stats.receivedBytes!, sentBytes: stats.sentBytes!, timestamp })
  return { receivedBytesPerSecond, sentBytesPerSecond, networkRatePending: hasNetworkCounters && previous === undefined }
}

async function collectDockerResources(cardId: string, dockerHost: string, containerId: string, resourceStats: readonly ResourceStat[]): Promise<ContainerResources | undefined> {
  try {
    const stats = parseDockerStats(await dockerRequest(dockerHost, `/containers/${encodeURIComponent(containerId)}/stats?stream=false`))
    if (!stats) return undefined
    const cpuDelta = stats.cpuStats.totalUsage - stats.previousCpuStats.totalUsage
    const systemDelta = stats.cpuStats.systemUsage - stats.previousCpuStats.systemUsage
    const cpuCount = stats.cpuStats.onlineCpus || stats.cpuStats.cpuCount
    const cpuPercent = systemDelta > 0 && cpuDelta >= 0 ? (cpuDelta / systemDelta) * cpuCount * 100 : undefined
    const network = networkRates(cardId, stats)
    return {
      cpuPercent: resourceStats.includes('cpu') ? cpuPercent : undefined,
      memoryUsage: resourceStats.includes('memory') ? stats.memoryUsage : undefined,
      memoryLimit: resourceStats.includes('memory') ? stats.memoryLimit : undefined,
      receivedBytesPerSecond: resourceStats.includes('network') ? network.receivedBytesPerSecond : undefined,
      sentBytesPerSecond: resourceStats.includes('network') ? network.sentBytesPerSecond : undefined,
      networkRatePending: resourceStats.includes('network') && network.networkRatePending
    }
  } catch {
    return undefined
  }
}

function normalizeCustomMetric(locale: AppConfig['locale'], key: string, metric: MetricCollectionDetails['selectedMetrics'][number][1], value: number | string): CollectedCustomMetric | undefined {
  const label = localizeMetricLabel(locale, key, metric.label)
  if (metric.valueType === 'string' && typeof value === 'string') return { key, label, value }
  if (metric.valueType === 'state' && typeof value === 'string') {
    const valueLabel = metric.stateLabels?.[value]
    return { key, label, ...(valueLabel === undefined ? {} : { valueLabel }), color: metric.stateColors?.[value] ?? metric.color, value }
  }
  if (metric.valueType === 'number' && typeof value === 'number') {
    return { key, label, unit: metric.unit, chart: metric.chart, ...(metric.chartGroup === undefined ? {} : { chartGroup: metric.chartGroup }), ...(metric.rate ? { rate: true } : {}), value }
  }
  return undefined
}

async function collectCustomMetrics(
  config: AppConfig,
  cardId: string,
  details: MetricCollectionDetails,
  includeUptimeHistory: boolean
): Promise<Pick<ContainerMetricUsage, 'customMetrics' | 'uptimeMetrics' | 'metricErrors'>> {
  const uptimeHistoryPeriodMs = Math.max(details.historyPeriodMs, UPTIME_HISTORY_PERIOD_MS)
  const results = await Promise.all(
    details.selectedMetrics.map(async ([key, metric]) => {
      if (metric.valueType !== 'uptime' && hasMetricRecovery(cardId, key)) cancelMetricRecovery(config, cardId, key, PAGINATED_UPTIME_RECOVERY_SOURCE_PREFIX)
      const bootstrap =
        metric.valueType === 'uptime' && !metric.pagination?.recover && metric.source.initialQuery !== undefined && !hasUptimeObservationHistory(config, cardId, key, uptimeHistoryPeriodMs)
      const result = await collectCustomMetric(key, metric, bootstrap)
      return { key, metric, result }
    })
  )
  const customMetrics: ContainerMetricUsage['customMetrics'] = []
  const uptimeMetrics: NonNullable<ContainerMetricUsage['uptimeMetrics']> = []
  const metricErrors = [...details.metricErrors]
  for (const { key, metric, result } of results) {
    if ('observations' in result && metric.valueType === 'uptime') {
      const previous = getLatestUptimeObservation(config, cardId, key, uptimeHistoryPeriodMs)
      queuePaginatedUptimeRecovery(config, cardId, key, metric, result.observations, result.nextPage, previous?.timestamp, uptimeHistoryPeriodMs)
      saveUptimeObservationHistory(config, cardId, key, result.observations, uptimeHistoryPeriodMs)
      const latest = getLatestUptimeObservation(config, cardId, key, uptimeHistoryPeriodMs)
      uptimeMetrics.push({
        key,
        label: localizeMetricLabel(config.locale, key, metric.label),
        current: latest?.status ?? 'unknown',
        ...(includeUptimeHistory ? { observations: getUptimeObservationHistory(config, cardId, key, uptimeHistoryPeriodMs) } : {})
      })
    } else if ('error' in result && metric.valueType === 'uptime') {
      const latest = getLatestUptimeObservation(config, cardId, key, uptimeHistoryPeriodMs)
      queuePaginatedUptimeRecovery(config, cardId, key, metric, [], undefined, latest?.timestamp, uptimeHistoryPeriodMs)
      if (latest)
        uptimeMetrics.push({
          key,
          label: localizeMetricLabel(config.locale, key, metric.label),
          current: latest.status,
          ...(includeUptimeHistory ? { observations: getUptimeObservationHistory(config, cardId, key, uptimeHistoryPeriodMs) } : {})
        })
      metricErrors.push({ key, code: result.error })
    } else if ('value' in result) {
      const collected = normalizeCustomMetric(config.locale, key, metric, result.value)
      if (collected) customMetrics.push(collected)
    } else if ('error' in result) metricErrors.push({ key, code: result.error })
  }
  return { customMetrics, ...(uptimeMetrics.length > 0 ? { uptimeMetrics } : {}), metricErrors }
}

function sample(
  cardId: string,
  resource: ContainerResources | undefined,
  collected: Pick<ContainerMetricUsage, 'customMetrics' | 'uptimeMetrics' | 'metricErrors'>,
  details: MetricCollectionDetails
): ContainerMetricSample | undefined {
  if (!resource && collected.customMetrics.length === 0 && !collected.uptimeMetrics?.length && collected.metricErrors.length === 0) return undefined
  return {
    cardId,
    resource,
    customMetrics: collected.customMetrics,
    ...(collected.uptimeMetrics ? { uptimeMetrics: collected.uptimeMetrics } : {}),
    metricErrors: collected.metricErrors,
    metricsPollIntervalMs: details.metricsPollIntervalMs,
    metricsHistoryPeriodMs: details.historyPeriodMs
  }
}

function target(
  config: AppConfig,
  cardId: string,
  details: MetricCollectionDetails,
  hasContainerResource: boolean,
  collectResource?: () => Promise<ContainerResources | undefined>
): MetricCollectionTarget {
  return {
    cardId,
    metricsPollIntervalMs: details.metricsPollIntervalMs,
    hasContainerResource,
    metricSources: details.selectedMetrics.map(([key, metric]) => [key, metric.source.url] as const),
    collect: async (includeUptimeHistory = true) => {
      const [resource, collected] = await Promise.all([collectResource?.(), collectCustomMetrics(config, cardId, details, includeUptimeHistory)])
      return sample(cardId, resource, collected, details)
    }
  }
}

export async function usageForTarget(target: MetricCollectionTarget, details: MetricCollectionDetails, collect: boolean): Promise<ContainerMetricUsage | undefined> {
  if (!collect)
    return {
      historyPeriodMs: details.historyPeriodMs,
      customMetrics: [],
      metricErrors: details.metricErrors,
      ...(details.metricsAccess ? { metricsAccess: details.metricsAccess } : {}),
      metricsPollIntervalMs: details.metricsPollIntervalMs
    }
  const result = await target.collect()
  return (
    result && {
      ...(target.hasContainerResource ? { resource: result.resource } : {}),
      customMetrics: result.customMetrics,
      ...(result.uptimeMetrics ? { uptimeMetrics: result.uptimeMetrics } : {}),
      metricErrors: result.metricErrors,
      historyPeriodMs: result.metricsHistoryPeriodMs,
      ...(details.metricsAccess ? { metricsAccess: details.metricsAccess } : {})
    }
  )
}

export function dockerMetricTarget(
  config: AppConfig,
  cardId: string,
  dockerHost: string,
  container: DockerContainer,
  resolved: ResolvedContainer
): { target: MetricCollectionTarget; details: MetricCollectionDetails } | undefined {
  if (container.State !== 'running' || resolved.labels.hidden || !resolved.url || resolved.labels.showStatus === false) return undefined
  const details = metricCollectionDetails(resolved, config)
  if (details.resourceStats.length === 0 && details.selectedMetrics.length === 0 && details.metricErrors.length === 0) return undefined
  return {
    target: target(config, cardId, details, true, details.resourceStats.length > 0 ? () => collectDockerResources(cardId, dockerHost, container.Id, details.resourceStats) : undefined),
    details
  }
}

export function yamlMetricTarget(
  config: AppConfig,
  name: string,
  service: ServiceOverrides,
  resolved: ResolvedMetricCard
): { target: MetricCollectionTarget; details: MetricCollectionDetails } | undefined {
  if (service.hidden || !service.url || !isValidUrl(service.url) || service.showStatus === false) return undefined
  const details = metricCollectionDetails(resolved, config, false)
  if (details.selectedMetrics.length === 0 && details.metricErrors.length === 0) return undefined
  return { target: target(config, `yaml-${name}`, details, false), details }
}
