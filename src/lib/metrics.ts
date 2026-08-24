import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { AppConfig } from './config'
import { collectContainerResourceUsage } from './docker'
import type { ContainerResources, ResourceMetricSample } from './status'

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
const lastMetricCollection = new Map<string, number>()

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

export function saveResourceMetric(
  config: AppConfig,
  cardId: string,
  resource: ContainerResources,
  historyPeriodMs = config.metricsHistoryPeriodMs,
  timestamp = Date.now()
): void {
  const db = database(config.metricsDatabasePath)
  db.prepare(`
    INSERT INTO resource_metrics (
      card_id, timestamp, cpu_percent, memory_usage, memory_limit,
      received_bytes_per_second, sent_bytes_per_second
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    cardId,
    timestamp,
    resource.cpuPercent ?? null,
    resource.memoryUsage ?? null,
    resource.memoryLimit ?? null,
    resource.receivedBytesPerSecond ?? null,
    resource.sentBytesPerSecond ?? null
  )
  db.prepare('DELETE FROM resource_metrics WHERE card_id = ? AND timestamp < ?').run(cardId, timestamp - historyPeriodMs)
  if (resource.cpuPercent !== undefined) saveMetricSample(config, cardId, 'cpu', resource.cpuPercent, historyPeriodMs, timestamp)
  if (resource.memoryUsage !== undefined) saveMetricSample(config, cardId, 'memory', resource.memoryUsage, historyPeriodMs, timestamp)
  if (resource.receivedBytesPerSecond !== undefined) saveMetricSample(config, cardId, 'received', resource.receivedBytesPerSecond, historyPeriodMs, timestamp)
  if (resource.sentBytesPerSecond !== undefined) saveMetricSample(config, cardId, 'sent', resource.sentBytesPerSecond, historyPeriodMs, timestamp)
}

export function getResourceMetricHistory(
  config: AppConfig,
  cardId: string,
  historyPeriodMs = config.metricsHistoryPeriodMs,
  now = Date.now()
): ResourceMetricSample[] {
  const db = database(config.metricsDatabasePath)
  const cutoff = now - historyPeriodMs
  db.prepare('DELETE FROM resource_metrics WHERE card_id = ? AND timestamp < ?').run(cardId, cutoff)
  const rows = db.prepare(`
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
  `).all(cardId, cutoff) as DatabaseMetricRow[]
  return rows.map(row => ({
    timestamp: row.timestamp,
    cpuPercent: row.cpuPercent ?? undefined,
    memoryUsage: row.memoryUsage ?? undefined,
    memoryLimit: row.memoryLimit ?? undefined,
    receivedBytesPerSecond: row.receivedBytesPerSecond ?? undefined,
    sentBytesPerSecond: row.sentBytesPerSecond ?? undefined
  }))
}

export function saveMetricSample(
  config: AppConfig,
  cardId: string,
  metricKey: string,
  value: number,
  historyPeriodMs = config.metricsHistoryPeriodMs,
  timestamp = Date.now()
): void {
  if (!Number.isFinite(value)) return
  const db = database(config.metricsDatabasePath)
  db.prepare('INSERT INTO metric_samples (card_id, metric_key, timestamp, value) VALUES (?, ?, ?, ?)')
    .run(cardId, metricKey, timestamp, value)
  db.prepare('DELETE FROM metric_samples WHERE card_id = ? AND metric_key = ? AND timestamp < ?')
    .run(cardId, metricKey, timestamp - historyPeriodMs)
}

export function getMetricHistory(
  config: AppConfig,
  cardId: string,
  metricKey: string,
  historyPeriodMs = config.metricsHistoryPeriodMs,
  now = Date.now()
): GenericMetricRow[] {
  const cutoff = now - historyPeriodMs
  const db = database(config.metricsDatabasePath)
  db.prepare('DELETE FROM metric_samples WHERE card_id = ? AND metric_key = ? AND timestamp < ?')
    .run(cardId, metricKey, cutoff)
  return db.prepare(`
    SELECT timestamp, value
    FROM metric_samples
    WHERE card_id = ? AND metric_key = ? AND timestamp >= ?
    ORDER BY timestamp
  `).all(cardId, metricKey, cutoff) as GenericMetricRow[]
}

function pruneMetricHistory(config: AppConfig, timestamp: number): void {
  const db = database(config.metricsDatabasePath)
  const cutoff = timestamp - config.metricsHistoryPeriodMs
  db.prepare('DELETE FROM resource_metrics WHERE timestamp < ?').run(cutoff)
  db.prepare('DELETE FROM metric_samples WHERE timestamp < ?').run(cutoff)
}

async function collectAndSave(config: AppConfig): Promise<void> {
  const samples = await collectContainerResourceUsage(config)
  const timestamp = Date.now()
  pruneMetricHistory(config, timestamp)
  for (const { cardId, resource, customMetrics, metricsPollIntervalMs, metricsHistoryPeriodMs } of samples) {
    const previous = lastMetricCollection.get(cardId)
    if (previous !== undefined && timestamp - previous < metricsPollIntervalMs) continue
    if (resource) saveResourceMetric(config, cardId, resource, metricsHistoryPeriodMs, timestamp)
    for (const metric of customMetrics) {
      if (typeof metric.value === 'number') saveMetricSample(config, cardId, metric.key, metric.value, metricsHistoryPeriodMs, timestamp)
    }
    lastMetricCollection.set(cardId, timestamp)
  }
}

function collectInBackground(config: AppConfig): void {
  void collectAndSave(config).catch(() => undefined)
}

export function startMetricsCollection(config: AppConfig): void {
  if (collectionStarted || !config.showResourceUsage) return
  collectionStarted = true
  collectInBackground(config)
  const timer = setInterval(() => collectInBackground(config), config.metricsPollIntervalMs)
  timer.unref()
}

export function clearMetricsDatabase(): void {
  state?.database.close()
  state = undefined
  collectionStarted = false
  lastMetricCollection.clear()
}
