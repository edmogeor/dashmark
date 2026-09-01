import type { AppConfig } from './config'
import { collectDiscoveredMetricUsage, discoveredMetricSchedules } from './docker'
import type { ContainerMetricUsage } from './docker'
import { clearMetricsStorage, metricsDatabase, pruneMetricHistory, saveMetricSample, saveResourceMetric } from './metrics-storage'
import { getDiscoveryCoordinator } from './discovery-coordinator'

export { getMetricHistory, getResourceMetricHistory, saveMetricSample, saveResourceMetric } from './metrics-storage'

let collectionStarted = false
let collectionInProgress = false
let collectionTimer: ReturnType<typeof setTimeout> | undefined
const lastMetricCollection = new Map<string, number>()
const latestMetricUsage = new Map<string, ContainerMetricUsage>()
const customMetricCounterCache = new Map<string, { value: number; timestamp: number }>()
const NETWORK_RATE_PRIME_DELAY_MS = 1_000

function discardRemovedMetricState(cardIds: ReadonlySet<string>): void {
  for (const cardId of latestMetricUsage.keys()) if (!cardIds.has(cardId)) latestMetricUsage.delete(cardId)
  for (const cardId of lastMetricCollection.keys()) if (!cardIds.has(cardId)) lastMetricCollection.delete(cardId)
  for (const key of customMetricCounterCache.keys()) {
    const cardId = key.slice(0, key.indexOf('\0'))
    if (!cardIds.has(cardId)) customMetricCounterCache.delete(key)
  }
}

export function counterRates(cardId: string, metrics: ContainerMetricUsage['customMetrics'], timestamp: number): ContainerMetricUsage['customMetrics'] {
  return metrics.flatMap((metric) => {
    if (!('rate' in metric) || metric.rate !== true) return [metric]
    const key = `${cardId}\0${metric.key}`
    const previous = customMetricCounterCache.get(key)
    customMetricCounterCache.set(key, { value: metric.value, timestamp })
    if (!previous || timestamp <= previous.timestamp) return [{ ...metric, value: 0, pending: true }]
    return [{ ...metric, value: Math.max(0, (metric.value - previous.value) / ((timestamp - previous.timestamp) / 1_000)) }]
  })
}

async function collectAndSave(config: AppConfig, force = false): Promise<void> {
  const due = new Set(
    discoveredMetricSchedules().flatMap(({ cardId, metricsPollIntervalMs }) => {
      const previous = lastMetricCollection.get(cardId)
      return force || previous === undefined || Date.now() - previous >= metricsPollIntervalMs ? [cardId] : []
    })
  )
  if (due.size === 0) return
  const samples = await collectDiscoveredMetricUsage(due)
  const timestamp = Date.now()
  const db = metricsDatabase(config.metricsDatabasePath)
  const collected = samples.map(({ cardId, resource, customMetrics, uptimeMetrics, metricErrors, metricsPollIntervalMs, metricsHistoryPeriodMs }) => ({
    cardId,
    resource,
    customMetrics: counterRates(cardId, customMetrics, timestamp),
    uptimeMetrics: uptimeMetrics ?? latestMetricUsage.get(cardId)?.uptimeMetrics,
    metricErrors,
    metricsPollIntervalMs,
    metricsHistoryPeriodMs
  }))

  // A collection can write several rows per card. Commit them together to avoid
  // synchronizing SQLite's journal for every individual metric.
  db.exec('BEGIN')
  try {
    pruneMetricHistory(config, timestamp)
    for (const { cardId, resource, customMetrics, metricsHistoryPeriodMs } of collected) {
      if (resource) saveResourceMetric(config, cardId, resource, metricsHistoryPeriodMs, timestamp)
      for (const metric of customMetrics) {
        if (typeof metric.value === 'number' && !('pending' in metric && metric.pending)) saveMetricSample(config, cardId, metric.key, metric.value, metricsHistoryPeriodMs, timestamp)
      }
    }
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }

  for (const { cardId, resource, customMetrics, uptimeMetrics, metricErrors, metricsPollIntervalMs, metricsHistoryPeriodMs } of collected) {
    latestMetricUsage.set(cardId, { resource, customMetrics, uptimeMetrics, metricErrors, metricsPollIntervalMs, historyPeriodMs: metricsHistoryPeriodMs })
    getDiscoveryCoordinator(config).publishMetrics(cardId)
  }
  // An unavailable target is retried on its next due interval, not in a busy loop.
  for (const cardId of due) lastMetricCollection.set(cardId, timestamp)
}

function collectInBackground(config: AppConfig, force = false): Promise<void> | undefined {
  if (collectionInProgress) return undefined
  collectionInProgress = true
  return collectAndSave(config, force)
    .catch(() => undefined)
    .finally(() => {
      collectionInProgress = false
    })
}

function scheduleCollection(config: AppConfig): void {
  if (!collectionStarted) return
  const now = Date.now()
  const schedules = discoveredMetricSchedules()
  const nextDue = schedules.reduce(
    (earliest, { cardId, metricsPollIntervalMs }) => {
      const lastCollected = lastMetricCollection.get(cardId)
      return Math.min(earliest, lastCollected === undefined ? now : lastCollected + metricsPollIntervalMs)
    },
    schedules.length > 0 ? Number.POSITIVE_INFINITY : now + config.statusPollIntervalMs
  )
  const timer = setTimeout(
    () => {
      const collection = collectInBackground(config)
      if (collection) void collection.finally(() => scheduleCollection(config))
      else scheduleCollection(config)
      // Discovery replaces the in-memory targets independently. Recheck that cache at
      // its cadence without collecting any target that is not due.
    },
    Math.max(0, Math.min(nextDue, now + config.statusPollIntervalMs) - Date.now())
  )
  timer.unref()
  collectionTimer = timer
}

export function getLatestMetricUsage(cardId: string): ContainerMetricUsage | undefined {
  return latestMetricUsage.get(cardId)
}

export function startMetricsCollection(config: AppConfig): void {
  if (collectionStarted || !config.showMetrics) return
  collectionStarted = true
  const coordinator = getDiscoveryCoordinator(config)
  coordinator.onCardsChange(discardRemovedMetricState)
  void coordinator.ready().then(() => {
    const initialCollection = collectInBackground(config)
    if (!initialCollection) return
    void initialCollection.then(() => {
      const timer = setTimeout(() => collectInBackground(config, true), NETWORK_RATE_PRIME_DELAY_MS)
      timer.unref()
      scheduleCollection(config)
    })
  })
}

export function clearMetricsDatabase(): void {
  clearMetricsStorage()
  collectionStarted = false
  collectionInProgress = false
  if (collectionTimer) clearTimeout(collectionTimer)
  collectionTimer = undefined
  lastMetricCollection.clear()
  latestMetricUsage.clear()
  customMetricCounterCache.clear()
}
