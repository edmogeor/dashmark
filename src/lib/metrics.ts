import type { AppConfig } from './config'
import { NETWORK_RATE_PRIME_DELAY_MS } from './constants'
import { collectDiscoveredMetricUsage, discoveredMetricSchedules } from './docker'
import type { Card, ContainerMetricUsage } from './docker'
import { clearMetricsStorage, metricsDatabase, pruneMetricHistory, saveMetricSample, saveResourceMetric } from './metrics-storage'
import { getDiscoveryCoordinator } from './discovery-coordinator'
import { clearMetricRecoveryQueue, nextMetricRecoveryAt, pruneMetricRecoveryQueue, recoverNextMetric } from './metric-recovery'

let collectionStarted = false
let collectionInProgress: Promise<void> | undefined
let collectionTimer: ReturnType<typeof setTimeout> | undefined
const lastMetricCollection = new Map<string, number>()
const latestMetricUsage = new Map<string, ContainerMetricUsage>()
const customMetricCounterCache = new Map<string, { value: number; timestamp: number }>()

function discardRemovedMetricState(config: AppConfig, cardIds: ReadonlySet<string>, cards: readonly Card[]): void {
  pruneMetricRecoveryQueue(config, new Set(cards.flatMap((card) => (card.customMetricLabels ?? []).map((metric) => `${card.id}\0${metric.key}`))))
  for (const cardId of latestMetricUsage.keys()) if (!cardIds.has(cardId)) latestMetricUsage.delete(cardId)
  for (const cardId of lastMetricCollection.keys()) if (!cardIds.has(cardId)) lastMetricCollection.delete(cardId)
  const metricKeys = new Map(cards.map((card) => [card.id, new Set(card.customMetricKeys)]))
  for (const key of customMetricCounterCache.keys()) {
    const cardId = key.slice(0, key.indexOf('\0'))
    if (!metricKeys.get(cardId)?.has(key.slice(key.indexOf('\0') + 1))) customMetricCounterCache.delete(key)
  }
}

export function counterRates(cardId: string, metrics: ContainerMetricUsage['customMetrics'], timestamp: number): ContainerMetricUsage['customMetrics'] {
  return metrics.map((metric) => {
    if (!('rate' in metric) || metric.rate !== true) return metric
    const key = `${cardId}\0${metric.key}`
    const previous = customMetricCounterCache.get(key)
    customMetricCounterCache.set(key, { value: metric.value, timestamp })
    if (!previous || timestamp <= previous.timestamp) return { ...metric, value: 0, pending: true }
    return { ...metric, value: Math.max(0, (metric.value - previous.value) / ((timestamp - previous.timestamp) / 1_000)) }
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

function collectInBackground(config: AppConfig, force = false): Promise<void> {
  if (collectionInProgress) return collectionInProgress
  collectionInProgress = (async () => {
    await collectAndSave(config, force)
    const recovered = await recoverNextMetric(config)
    if (!recovered) return
    const usage = latestMetricUsage.get(recovered.cardId)
    if (usage?.uptimeMetrics) {
      usage.uptimeMetrics = usage.uptimeMetrics.map((metric) => (metric.key === recovered.metricKey ? { key: metric.key, label: metric.label, current: metric.current } : metric))
    }
  })()
    .catch(() => undefined)
    .finally(() => {
      collectionInProgress = undefined
    })
  return collectionInProgress
}

function scheduleCollection(config: AppConfig): void {
  if (!collectionStarted) return
  if (collectionTimer) clearTimeout(collectionTimer)
  const now = Date.now()
  const schedules = discoveredMetricSchedules()
  const nextDue = schedules.reduce((earliest, { cardId, metricsPollIntervalMs }) => {
    const lastCollected = lastMetricCollection.get(cardId)
    return Math.min(earliest, lastCollected === undefined ? now : lastCollected + metricsPollIntervalMs)
  }, nextMetricRecoveryAt())
  if (!Number.isFinite(nextDue)) {
    collectionTimer = undefined
    return
  }
  const timer = setTimeout(
    () => {
      void collectInBackground(config).finally(() => scheduleCollection(config))
    },
    Math.max(0, nextDue - Date.now())
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
  coordinator.onCardsChange((cardIds, cards) => discardRemovedMetricState(config, cardIds, cards))
  coordinator.onCardsChange(() => scheduleCollection(config))
  void coordinator.ready().then(() => {
    const initialCollection = collectInBackground(config)
    void initialCollection.then(() => {
      const timer = setTimeout(() => collectInBackground(config, true), NETWORK_RATE_PRIME_DELAY_MS)
      timer.unref()
      scheduleCollection(config)
    })
  })
}

export function clearMetricsDatabase(): void {
  clearMetricRecoveryQueue()
  clearMetricsStorage()
  collectionStarted = false
  collectionInProgress = undefined
  if (collectionTimer) clearTimeout(collectionTimer)
  collectionTimer = undefined
  lastMetricCollection.clear()
  latestMetricUsage.clear()
  customMetricCounterCache.clear()
}
