import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { AppConfig } from './config'
import { collectContainerResourceUsage } from './docker'
import type { ContainerMetricUsage } from './docker'
import type { ContainerResources, ResourceMetricSample, UptimeMetric, UptimeObservation } from './status'

type DatabaseState = { path: string; database: DatabaseSync }
type DatabaseMetricRow = {
  timestamp: number
  cpuPercent: number | null
  memoryUsage: number | null
  memoryLimit: number | null
  receivedBytesPerSecond: number | null
  sentBytesPerSecond: number | null
}

type GenericMetricRow = { timestamp: number; value: number }

let state: DatabaseState | undefined
let collectionStarted = false
let collectionInProgress = false
const lastMetricCollection = new Map<string, number>()
const latestMetricUsage = new Map<string, ContainerMetricUsage>()
const customMetricCounterCache = new Map<string, { value: number; timestamp: number }>()
const uptimeMetricCache = new Map<string, UptimeObservation[]>()

export function counterRates(cardId: string, metrics: ContainerMetricUsage['customMetrics'], timestamp: number): ContainerMetricUsage['customMetrics'] {
  return metrics.flatMap((metric) => {
    if (!('rate' in metric) || metric.rate !== true) return [metric]
    const key = `${cardId}:${metric.key}`
    const previous = customMetricCounterCache.get(key)
    customMetricCounterCache.set(key, { value: metric.value, timestamp })
    if (!previous || timestamp <= previous.timestamp) return [{ ...metric, value: 0, pending: true }]
    return [{ ...metric, value: Math.max(0, (metric.value - previous.value) / ((timestamp - previous.timestamp) / 1_000)) }]
  })
}

function observationKey(observation: UptimeObservation): string {
  return `${observation.timestamp}\0${observation.status}\0${observation.responseTimeMs ?? ''}`
}

function mergeUptimeMetrics(cardId: string, metrics: UptimeMetric[] | undefined, historyPeriodMs: number, timestamp: number): UptimeMetric[] | undefined {
  if (!metrics?.length) return undefined
  const cutoff = timestamp - historyPeriodMs
  return metrics.map((metric) => {
    const key = `${cardId}\0${metric.key}`
    const observations = new Map((uptimeMetricCache.get(key) ?? []).map((observation) => [observationKey(observation), observation]))
    for (const observation of metric.observations) observations.set(observationKey(observation), observation)
    const retained = [...observations.values()].filter((observation) => observation.timestamp >= cutoff).sort((a, b) => a.timestamp - b.timestamp)
    uptimeMetricCache.set(key, retained)
    return { ...metric, current: retained.at(-1)?.status ?? 'unknown', observations: retained }
  })
}

function database(path: string): DatabaseSync {
  if (state?.path === path) return state.database
  state?.database.close()
  mkdirSync(dirname(path), { recursive: true })
  const db = new DatabaseSync(path)
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS resource_metrics (
      card_id TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      cpu_percent REAL,
      memory_usage INTEGER,
      memory_limit INTEGER,
      received_bytes_per_second REAL,
      sent_bytes_per_second REAL
    );
    CREATE INDEX IF NOT EXISTS resource_metrics_card_timestamp
      ON resource_metrics (card_id, timestamp);
    CREATE TABLE IF NOT EXISTS metric_samples (
      card_id TEXT NOT NULL,
      metric_key TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      value REAL NOT NULL
    );
    CREATE INDEX IF NOT EXISTS metric_samples_card_key_timestamp
      ON metric_samples (card_id, metric_key, timestamp);
  `)
  state = { path, database: db }
  return db
}

export function saveResourceMetric(config: AppConfig, cardId: string, resource: ContainerResources, historyPeriodMs = config.metricsHistoryPeriodMs, timestamp = Date.now()): void {
  const db = database(config.metricsDatabasePath)
  db.prepare(
    `
    INSERT INTO resource_metrics (
      card_id, timestamp, cpu_percent, memory_usage, memory_limit,
      received_bytes_per_second, sent_bytes_per_second
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `
  ).run(cardId, timestamp, resource.cpuPercent ?? null, resource.memoryUsage ?? null, resource.memoryLimit ?? null, resource.receivedBytesPerSecond ?? null, resource.sentBytesPerSecond ?? null)
  db.prepare('DELETE FROM resource_metrics WHERE card_id = ? AND timestamp < ?').run(cardId, timestamp - historyPeriodMs)
  for (const [key, value] of Object.entries({
    cpu: resource.cpuPercent,
    memory: resource.memoryUsage,
    received: resource.receivedBytesPerSecond,
    sent: resource.sentBytesPerSecond
  })) {
    if (value !== undefined) saveMetricSample(config, cardId, key, value, historyPeriodMs, timestamp)
  }
}

export function getResourceMetricHistory(config: AppConfig, cardId: string, historyPeriodMs = config.metricsHistoryPeriodMs, now = Date.now()): ResourceMetricSample[] {
  const db = database(config.metricsDatabasePath)
  const cutoff = now - historyPeriodMs
  const rows = db
    .prepare(
      `
    SELECT
      timestamp,
      cpu_percent AS cpuPercent,
      memory_usage AS memoryUsage,
      memory_limit AS memoryLimit,
      received_bytes_per_second AS receivedBytesPerSecond,
      sent_bytes_per_second AS sentBytesPerSecond
    FROM resource_metrics
    WHERE card_id = ? AND timestamp >= ?
    ORDER BY timestamp
  `
    )
    .all(cardId, cutoff) as DatabaseMetricRow[]
  return rows.map((row) => ({
    timestamp: row.timestamp,
    cpuPercent: row.cpuPercent ?? undefined,
    memoryUsage: row.memoryUsage ?? undefined,
    memoryLimit: row.memoryLimit ?? undefined,
    receivedBytesPerSecond: row.receivedBytesPerSecond ?? undefined,
    sentBytesPerSecond: row.sentBytesPerSecond ?? undefined
  }))
}

export function saveMetricSample(config: AppConfig, cardId: string, metricKey: string, value: number, historyPeriodMs = config.metricsHistoryPeriodMs, timestamp = Date.now()): void {
  if (!Number.isFinite(value)) return
  const db = database(config.metricsDatabasePath)
  db.prepare('INSERT INTO metric_samples (card_id, metric_key, timestamp, value) VALUES (?, ?, ?, ?)').run(cardId, metricKey, timestamp, value)
  db.prepare('DELETE FROM metric_samples WHERE card_id = ? AND metric_key = ? AND timestamp < ?').run(cardId, metricKey, timestamp - historyPeriodMs)
}

export function getMetricHistory(config: AppConfig, cardId: string, metricKey: string, historyPeriodMs = config.metricsHistoryPeriodMs, now = Date.now()): GenericMetricRow[] {
  const cutoff = now - historyPeriodMs
  const db = database(config.metricsDatabasePath)
  return db
    .prepare(
      `
    SELECT timestamp, value
    FROM metric_samples
    WHERE card_id = ? AND metric_key = ? AND timestamp >= ?
    ORDER BY timestamp
  `
    )
    .all(cardId, metricKey, cutoff) as GenericMetricRow[]
}

function pruneMetricHistory(config: AppConfig, timestamp: number): void {
  const db = database(config.metricsDatabasePath)
  const cutoff = timestamp - config.metricsHistoryPeriodMs
  db.prepare('DELETE FROM resource_metrics WHERE timestamp < ?').run(cutoff)
  db.prepare('DELETE FROM metric_samples WHERE timestamp < ?').run(cutoff)
}

async function collectAndSave(config: AppConfig): Promise<void> {
  const samples = await collectContainerResourceUsage(config, (cardId, pollIntervalMs) => {
    const previous = lastMetricCollection.get(cardId)
    return previous === undefined || Date.now() - previous >= pollIntervalMs
  })
  const timestamp = Date.now()
  const db = database(config.metricsDatabasePath)
  const collected = samples.map(({ cardId, resource, customMetrics, uptimeMetrics, metricErrors, metricsHistoryPeriodMs }) => ({
    cardId,
    resource,
    customMetrics: counterRates(cardId, customMetrics, timestamp),
    uptimeMetrics: mergeUptimeMetrics(cardId, uptimeMetrics ?? latestMetricUsage.get(cardId)?.uptimeMetrics, metricsHistoryPeriodMs, timestamp),
    metricErrors,
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

  for (const { cardId, resource, customMetrics, uptimeMetrics, metricErrors, metricsHistoryPeriodMs } of collected) {
    latestMetricUsage.set(cardId, { resource, customMetrics, uptimeMetrics, metricErrors, historyPeriodMs: metricsHistoryPeriodMs })
    lastMetricCollection.set(cardId, timestamp)
  }
}

function collectInBackground(config: AppConfig): void {
  if (collectionInProgress) return
  collectionInProgress = true
  void collectAndSave(config)
    .catch(() => undefined)
    .finally(() => {
      collectionInProgress = false
    })
}

export function getLatestMetricUsage(cardId: string): ContainerMetricUsage | undefined {
  return latestMetricUsage.get(cardId)
}

export function startMetricsCollection(config: AppConfig): void {
  if (collectionStarted || !config.showMetrics) return
  collectionStarted = true
  collectInBackground(config)
  const timer = setInterval(() => collectInBackground(config), config.metricsPollIntervalMs)
  timer.unref()
}

export function clearMetricsDatabase(): void {
  state?.database.close()
  state = undefined
  collectionStarted = false
  collectionInProgress = false
  lastMetricCollection.clear()
  latestMetricUsage.clear()
  customMetricCounterCache.clear()
  uptimeMetricCache.clear()
}
